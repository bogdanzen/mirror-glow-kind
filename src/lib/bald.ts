/**
 * Client side of the server fallback: grabs frames from the camera and
 * streams back photorealistic bald portraits of the same person.
 */

export const FALLBACK_PROMPT =
  "Re-render this exact photograph of the same person as a documentary-grade, photorealistic portrait of a chemotherapy patient. Remove ALL hair: completely bald smooth scalp with no hair and no stubble, no eyebrows at all, no eyelashes, no beard and no moustache, clean-shaven skin. Keep the identity absolutely unchanged: identical face shape, identical eyes, nose, mouth, ears, skin tone, age, expression, head pose and camera angle. Keep the same clothing, the same background and the same lighting. Skin slightly paler and a little tired, natural fine skin texture and pores on the scalp. Serious, clinical, dignified, editorial photograph. Sharp focus, high detail, natural colour, no filter, no stylisation, no cartoon, no smoothing, no beauty retouch, no distortion, no extra people.";

/** Fast, latency-first model; the other one trades speed for fidelity. */
export const FALLBACK_MODELS = [
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst",
] as const;

function dataUrl(b64: string) {
  return `data:image/png;base64,${b64}`;
}

class BaldError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** Captures the current video frame as a square-ish JPEG file. */
export function frameToFile(video: HTMLVideoElement, longEdge = 1024): File | null {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, longEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const b64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], "frame.jpg", { type: "image/jpeg" });
}

function buildForm(file: File, prompt: string, model?: string) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("prompt", prompt);
  if (model) fd.append("model", model);
  return fd;
}

/**
 * Posts the frame and calls back with every partial preview and the final
 * image. Falls back to one non-streaming request when no event arrives.
 */
export async function baldifyFrame(
  file: File,
  prompt: string,
  onFrame: (url: string, isFinal: boolean) => void,
  signal?: AbortSignal,
  model?: string,
  partials = true,
): Promise<void> {
  const form = buildForm(file, prompt, model);
  if (!partials) form.append("stream", "false");
  const res = await fetch("/api/bald", {
    method: "POST",
    body: form,
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    throw new BaldError(
      `Fallback AI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
      res.status,
    );
  }

  if (!partials) {
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new BaldError("Fallback AI nu a returnat imagine");
    onFrame(dataUrl(b64), true);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let events = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; b64_json?: string };
          if (!evt.b64_json) continue;
          events += 1;
          onFrame(dataUrl(evt.b64_json), (evt.type ?? "").endsWith("completed"));
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    /* stream broke — fall through to the replay below */
  }

  if (events > 0) return;
  if (signal?.aborted) return;

  const fd = buildForm(file, prompt, model);
  fd.append("stream", "false");
  const replay = await fetch("/api/bald", { method: "POST", body: fd, ...(signal ? { signal } : {}) });
  if (!replay.ok) throw new BaldError(`Fallback AI ${replay.status}`, replay.status);
  const json = (await replay.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new BaldError("Fallback AI nu a returnat imagine");
  onFrame(dataUrl(b64), true);
}

/** Fast diffusion models on fal.ai (image-to-image, sub-second class). */
export const FAL_MODELS = [
  "fal-ai/fast-lcm-diffusion/image-to-image",
  "fal-ai/fast-sdxl/image-to-image",
  "fal-ai/flux/schnell/image-to-image",
] as const;

export type FalOptions = {
  key: string;
  model: string;
  strength: number;
  steps: number;
};

/** One pass through the fal.ai flash model; returns a single final image. */
export async function falFrame(
  file: File,
  prompt: string,
  fal: FalOptions,
  onFrame: (url: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("prompt", prompt);
  fd.append("model", fal.model);
  fd.append("strength", String(fal.strength));
  fd.append("steps", String(fal.steps));
  if (fal.key) fd.append("key", fal.key);
  const res = await fetch("/api/fal", { method: "POST", body: fd, ...(signal ? { signal } : {}) });
  if (!res.ok) {
    throw new BaldError(
      `fal.ai ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new BaldError("fal.ai nu a returnat imagine");
  onFrame(json.url, true);
}

export type BaldLoopOptions = {
  /** Returns a fresh camera frame, or null while the camera is not ready. */
  getFrame: () => File | null;
  prompt: string;
  model?: string;
  /** How many portraits stay in flight at once (1–2). */
  concurrency?: number;
  onFrame: (url: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  signal: AbortSignal;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    }, { once: true });
  });

/**
 * Keeps one or two transformations in flight so the portrait refreshes every
 * few seconds instead of freezing on the first result.
 */
export function startBaldLoop(options: BaldLoopOptions): void {
  const { getFrame, prompt, model, onFrame, onError, signal } = options;
  const workers = Math.min(2, Math.max(1, options.concurrency ?? 2));
  let firstDone = false;
  let stopped = false;

  const run = async (index: number) => {
    // Stagger the second worker so results land between the first one's.
    if (index > 0) await sleep(2500, signal);
    let backoff = 2000;
    while (!signal.aborted && !stopped) {
      const file = getFrame();
      if (!file) {
        await sleep(300, signal);
        continue;
      }
      try {
        const allowPartials = !firstDone && index === 0;
        await baldifyFrame(
          file,
          prompt,
          (url, isFinal) => {
            if (signal.aborted) return;
            if (isFinal) firstDone = true;
            onFrame(url, isFinal);
          },
          signal,
          model,
          allowPartials,
        );
        backoff = 2000;
      } catch (error) {
        if (signal.aborted) return;
        const err = error as BaldError;
        const status = typeof err.status === "number" ? err.status : 0;
        // Only rate limits and upstream hiccups are worth another attempt.
        if (status === 429 || status >= 500) {
          await sleep(backoff, signal);
          backoff = Math.min(15000, backoff * 2);
          continue;
        }
        stopped = true;
        onError?.(err instanceof Error ? err : new Error(String(error)));
        return;
      }
    }
  };

  for (let i = 0; i < workers; i += 1) void run(i);
}
