/**
 * One contract for every AI backend that can transform a camera frame.
 * The kiosk only ever calls processFrame(); how the bald head is produced
 * (our own GPU pod, a hosted model, or the demo effect) stays inside.
 */

export type ProviderId = "runpod" | "scope" | "fal-hair" | "perfectcorp" | "demo";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  runpod: "RunPod (GPU propriu)",
  scope: "Scope WebRTC (pod live)",
  "fal-hair": "fal.ai hair-change",
  perfectcorp: "PerfectCorp (YouCam)",
  demo: "Demo (fără AI)",
};

export type FrameOptions = {
  prompt: string;
  negativePrompt: string;
  denoise: number;
  seed: number;
  /** Square size of the frame sent to the provider. */
  size: number;
  /** Highest quality, one-shot mode used by the premium capture. */
  premium?: boolean;
  signal?: AbortSignal;
  config: ProviderConfig;
};

export type ProviderConfig = {
  /** Base URL of our own pod, e.g. https://xxxx-8000.proxy.runpod.net */
  podUrl: string;
  /** Gate token for our own box (not a third-party key). */
  podToken: string;
  timeoutMs: number;
};

export interface FrameProvider {
  id: ProviderId;
  label: string;
  /** Transforms one JPEG frame and resolves with the processed image. */
  processFrame(frame: Blob, opts: FrameOptions): Promise<Blob>;
  /** Optional reachability probe for the admin test button. */
  health?(config: ProviderConfig): Promise<boolean>;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const clean = b64.includes(",") ? (b64.split(",")[1] ?? "") : b64;
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}

/** Aborts a provider call once the configured timeout passes. */
export function withTimeout(opts: FrameOptions): {
  signal: AbortSignal;
  done: () => void;
} {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(1000, opts.config.timeoutMs));
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(id);
      opts.signal?.removeEventListener("abort", onAbort);
    },
  };
}
