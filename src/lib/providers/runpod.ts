import {
  base64ToBlob,
  blobToBase64,
  withTimeout,
  type FrameOptions,
  type FrameProvider,
  type ProviderConfig,
} from "./types";

/**
 * Our own GPU box. It does the hair masking and the img2img pass itself;
 * the kiosk only posts a frame and gets one back.
 */
export const runpodProvider: FrameProvider = {
  id: "runpod",
  label: "RunPod (GPU propriu)",

  async processFrame(frame: Blob, opts: FrameOptions): Promise<Blob> {
    const base = opts.config.podUrl.replace(/\/+$/, "");
    if (!base) throw new Error("Adresa pod-ului lipsește");
    const { signal, done } = withTimeout(opts);
    try {
      const res = await fetch(`${base}/frame`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.config.podToken ? { "X-Mirror-Token": opts.config.podToken } : {}),
        },
        body: JSON.stringify({
          image: await blobToBase64(frame),
          prompt: opts.prompt,
          negative_prompt: opts.negativePrompt,
          denoise: opts.denoise,
          seed: opts.seed,
          mask: "hair",
          ...(opts.premium ? { quality: "high", size: opts.size } : {}),
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Pod ${res.status}`);
      const json = (await res.json()) as { image?: string };
      if (!json.image) throw new Error("Pod-ul nu a returnat imagine");
      return base64ToBlob(json.image);
    } finally {
      done();
    }
  },

  async health(config: ProviderConfig): Promise<boolean> {
    const base = config.podUrl.replace(/\/+$/, "");
    if (!base) return false;
    const res = await fetch(`${base}/health`, {
      headers: config.podToken ? { "X-Mirror-Token": config.podToken } : {},
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return json.ok === true;
  },
};
