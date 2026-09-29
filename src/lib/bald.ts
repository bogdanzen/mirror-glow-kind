/**
 * Client side of the server fallback: grabs frames from the camera and
 * streams back photorealistic bald portraits of the same person.
 */

export const FALLBACK_PROMPT =
  "Photorealistically edit this exact camera photograph. It may contain one person, two people, a couple, a family, or a small group. Detect every clearly visible person and preserve every person's identity exactly. For EACH visible person independently, create complete medical alopecia: a naturally shaped, completely bald smooth scalp with no scalp hair, hairline, wisps or stubble; remove both eyebrows, all eyelashes, beard, moustache, sideburns and every trace of facial hair. Reconstruct the real head and scalp anatomy behind the removed hair, including a plausible full skull silhouette, ears and natural skin texture; never paste a bald sticker or mask over a face. Keep each person's exact face shape, eyes, nose, mouth, ears, skin tone, age, body, expression, gaze, pose, proportions and position. Do not merge faces, swap identities, duplicate people, remove people, add people, or change the spacing between them. Keep the full camera framing, crop, perspective, clothing, accessories, hands, background and lighting exactly unchanged. Skin may look subtly paler and tired while remaining natural, dignified and realistic. Serious clinical documentary portrait, sharp focus, high detail, natural colour, realistic pores, no filter, no stylisation, no cartoon, no beauty retouch, no plastic skin, no distortion, no warped anatomy, no text.";

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
  "fal-ai/fast-lightning-sdxl/image-to-image",
  "fal-ai/fast-lcm-diffusion/image-to-image",
  "fal-ai/fast-sdxl/image-to-image",
  "fal-ai/flux/schnell/image-to-image",
] as const;

/**
 * SDXL follows short, concrete prompts; the long documentary prompt written
 * for GPT-image models confuses it and softens the result.
 */
export const SDXL_HEAD_PROMPT =
  "photorealistic image edit of this exact person with complete medical alopecia, completely bald smooth scalp, remove every strand of scalp hair and the entire hairline, remove both eyebrows completely, remove all eyelashes, remove beard, moustache, sideburns and every trace of facial hair or stubble, clean bare natural skin everywhere except the eyes, nose and lips, preserve the exact head shape, skin tone, camera angle and lighting, do not alter facial identity, expression, eyes, nose or mouth, natural skin texture, sharp serious clinical documentary photograph";

/** The fixed base above, plus whatever detail the operator adds in the panel. */
export function sdxlPrompt(detail?: string): string {
  const extra = (detail ?? "").trim();
  return extra ? `${SDXL_HEAD_PROMPT}, ${extra}` : SDXL_HEAD_PROMPT;
}

export const SDXL_NEGATIVE_PROMPT =
  "hair, hairline, scalp hair, eyebrows, eyelashes, beard, moustache, mustache, sideburns, facial hair, stubble, five o'clock shadow, wig, hat, different person, changed identity, changed expression, changed eyes, changed nose, changed mouth, changed jaw, cartoon, illustration, painting, distorted face, deformed, extra head, blurry, oversaturated, plastic skin";

export const SMILE_PROMPT =
  "Photorealistic image edit of this exact person smiling naturally and warmly. Preserve the exact identity, face shape, eyes, nose, hair, eyebrows, skin tone, age, clothing, head pose, camera angle, background and lighting. Change only the expression into a genuine calm smile with natural cheeks and eyes. Healthy, dignified, sharp documentary portrait, realistic skin texture, no beauty filter, no stylisation, no distortion.";

export const SMILE_NEGATIVE_PROMPT =
  "bald, alopecia, missing hair, missing eyebrows, beard removed, different person, changed identity, changed face shape, exaggerated grin, uncanny teeth, distorted face, deformed, cartoon, illustration, painting, blurry, plastic skin";

export type FalOptions = {
  key: string;
  model: string;
  strength: number;
  steps: number;
  /** Fixed seed keeps consecutive heads consistent. */
  seed?: number;
  /** Square output size, matching the crop. */
  size?: number;
  negativePrompt?: string;
};

/** One flash-model pass over a head crop; resolves with the image URL. */
export async function falHead(
  file: File,
  prompt: string,
  fal: FalOptions,
  signal?: AbortSignal,
): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("prompt", prompt);
  fd.append("model", fal.model);
  fd.append("strength", String(fal.strength));
  fd.append("steps", String(fal.steps));
  if (fal.key) fd.append("key", fal.key);
  if (fal.seed) fd.append("seed", String(fal.seed));
  if (fal.size) fd.append("size", String(fal.size));
  if (fal.negativePrompt) fd.append("negative_prompt", fal.negativePrompt);
  const res = await fetch("/api/fal", { method: "POST", body: fd, ...(signal ? { signal } : {}) });
  if (!res.ok) {
    throw new BaldError(
      `fal.ai ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
      res.status,
    );
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new BaldError("fal.ai nu a returnat imagine");
  return json.url;
}

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
  if (fal.seed) fd.append("seed", String(fal.seed));
  if (fal.size) fd.append("size", String(fal.size));
  if (fal.negativePrompt) fd.append("negative_prompt", fal.negativePrompt);
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
  /** When present, the fast fal.ai model is used instead of the server model. */
  fal?: FalOptions;
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
  const { getFrame, prompt, model, onFrame, onError, signal, fal } = options;
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
        const emit = (url: string, isFinal: boolean) => {
          if (signal.aborted) return;
          if (isFinal) firstDone = true;
          onFrame(url, isFinal);
        };
        if (fal) {
          await falFrame(file, prompt, fal, emit, signal);
        } else {
          await baldifyFrame(file, prompt, emit, signal, model, allowPartials);
        }
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
