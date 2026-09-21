import {
  base64ToBlob,
  blobToBase64,
  withTimeout,
  type FrameOptions,
  type FrameProvider,
  type ProviderId,
} from "./types";

/**
 * Providers whose keys must never touch the browser. The frame goes to our
 * own server route, which holds FAL_KEY / PERFECTCORP_KEY.
 */
function serverProvider(id: ProviderId, label: string): FrameProvider {
  return {
    id,
    label,
    async processFrame(frame: Blob, opts: FrameOptions): Promise<Blob> {
      const { signal, done } = withTimeout(opts);
      try {
        const res = await fetch("/api/mirror-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: id,
            image: await blobToBase64(frame),
            prompt: opts.prompt,
            negative_prompt: opts.negativePrompt,
            denoise: opts.denoise,
            seed: opts.seed,
            size: opts.size,
            premium: Boolean(opts.premium),
          }),
          signal,
        });
        if (!res.ok) {
          throw new Error(`${label} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
        }
        const json = (await res.json()) as { image?: string; url?: string };
        if (json.image) return base64ToBlob(json.image);
        if (json.url) {
          const img = await fetch(json.url, { signal });
          if (!img.ok) throw new Error(`${label}: imaginea nu a putut fi descărcată`);
          return await img.blob();
        }
        throw new Error(`${label} nu a returnat imagine`);
      } finally {
        done();
      }
    },
    async health(): Promise<boolean> {
      const res = await fetch(`/api/mirror-frame?provider=${id}`);
      if (!res.ok) return false;
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      return json.ok === true;
    },
  };
}

export const falHairProvider = serverProvider("fal-hair", "fal.ai hair-change");
export const perfectcorpProvider = serverProvider("perfectcorp", "PerfectCorp (YouCam)");
