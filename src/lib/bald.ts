/**
 * Client side of the server fallback: grabs one frame from the camera and
 * streams back a photorealistic bald portrait of the same person.
 */

export const FALLBACK_PROMPT =
  "Re-render this exact photograph of the same person as a documentary-grade, photorealistic portrait of a chemotherapy patient. Remove ALL hair: completely bald smooth scalp with no hair and no stubble, no eyebrows at all, no eyelashes, no beard and no moustache, clean-shaven skin. Keep the identity absolutely unchanged: identical face shape, identical eyes, nose, mouth, ears, skin tone, age, expression, head pose and camera angle. Keep the same clothing, the same background and the same lighting. Skin slightly paler and a little tired, natural fine skin texture and pores on the scalp. Serious, clinical, dignified, editorial photograph. Sharp focus, high detail, natural colour, no filter, no stylisation, no cartoon, no smoothing, no beauty retouch, no distortion, no extra people.";

function dataUrl(b64: string) {
  return `data:image/png;base64,${b64}`;
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

function buildForm(file: File, prompt: string) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("prompt", prompt);
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
): Promise<void> {
  const res = await fetch("/api/bald", { method: "POST", body: buildForm(file, prompt), ...(signal ? { signal } : {}) });
  if (!res.ok || !res.body) {
    throw new Error(`Fallback AI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
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
  } catch {
    /* stream broke — fall through to the replay below */
  }

  if (events > 0) return;

  const fd = buildForm(file, prompt);
  fd.append("stream", "false");
  const replay = await fetch("/api/bald", { method: "POST", body: fd, ...(signal ? { signal } : {}) });
  if (!replay.ok) throw new Error(`Fallback AI ${replay.status}`);
  const json = (await replay.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Fallback AI nu a returnat imagine");
  onFrame(dataUrl(b64), true);
}
