/**
 * Pseudo-live mirror: one camera frame per second is transformed by the
 * active provider and crossfaded over the previous result. No continuous
 * stream, one request in flight, and the picture never goes blank.
 */

import { ProviderChain } from "./providers/registry";
import type { ProviderConfig, ProviderId } from "./providers/types";

export type FrameLoopOptions = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement | null;
  chain: ProviderId[];
  config: ProviderConfig;
  prompt: string;
  negativePrompt: string;
  denoise: number;
  seed: number;
  /** Square frame sent to the provider. */
  size?: number;
  intervalMs?: number;
  crossfadeMs?: number;
  onFirstFrame?: (latencyMs: number) => void;
  onProvider?: (provider: ProviderId, reason: string) => void;
  onError?: (error: Error) => void;
};

export type FrameLoop = {
  stop: () => void;
  attach: (canvas: HTMLCanvasElement | null) => void;
  /** Last processed image as a data URL, for the capture screen. */
  snapshot: () => string;
  /** Sharpest of the last raw frames, for the premium capture. */
  bestRaw: () => Blob | null;
  active: () => ProviderId;
};

/** Rough sharpness score: higher means more edge energy. */
function sharpness(data: Uint8ClampedArray, width: number, height: number): number {
  let total = 0;
  const step = 4 * 4;
  for (let y = 1; y < height - 1; y += 4) {
    for (let x = 4; x < width - 4; x += 4) {
      const i = (y * width + x) * 4;
      const j = i + step;
      if (j + 2 >= data.length) continue;
      total += Math.abs((data[i] ?? 0) - (data[j] ?? 0));
    }
  }
  return total;
}

export function startFrameLoop(options: FrameLoopOptions): FrameLoop {
  const size = options.size ?? 512;
  const intervalMs = options.intervalMs ?? 1000;
  const crossfadeMs = options.crossfadeMs ?? 600;

  let canvas = options.canvas;
  let stopped = false;
  let inFlight = false;
  let previous: ImageBitmap | null = null;
  let current: ImageBitmap | null = null;
  let switchedAt = 0;
  let raf = 0;
  let timer = 0;
  let lastDataUrl = "";
  const rawFrames: { blob: Blob; score: number }[] = [];

  const chain = new ProviderChain({
    chain: options.chain,
    config: options.config,
    maxFailures: 3,
    slowMs: 3000,
    recoverMs: 30000,
    onSwitch: (provider, reason) => options.onProvider?.(provider, reason),
  });

  const grab = document.createElement("canvas");
  grab.width = size;
  grab.height = size;
  const grabCtx = grab.getContext("2d", { willReadFrequently: true });

  /** Centred square crop guided by the face oval (slightly above centre). */
  const capture = async (): Promise<Blob | null> => {
    const video = options.video;
    if (!grabCtx || !video.videoWidth) return null;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = Math.max(0, (video.videoHeight - side) / 2 - side * 0.08);
    grabCtx.imageSmoothingQuality = "high";
    grabCtx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    const image = grabCtx.getImageData(0, 0, size, size);
    const score = sharpness(image.data, size, size);
    const blob = await new Promise<Blob | null>((resolve) =>
      grab.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (blob) {
      rawFrames.push({ blob, score });
      if (rawFrames.length > 3) rawFrames.shift();
    }
    return blob;
  };

  const mask = document.createElement("canvas");
  const render = () => {
    if (stopped) return;
    raf = requestAnimationFrame(render);
    const target = canvas;
    const video = options.video;
    if (!target || !video.videoWidth) return;
    const rect = target.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(320, Math.round(rect.width * dpr));
    const ch = Math.max(320, Math.round(rect.height * dpr));
    if (target.width !== cw || target.height !== ch) {
      target.width = cw;
      target.height = ch;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return;
    // Reality first: the live camera, cover-fit, always visible.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(cw / vw, ch / vh);
    const dx = (cw - vw * scale) / 2;
    const dy = (ch - vh * scale) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, dx, dy, vw * scale, vh * scale);
    if (!current) return;
    // Generated head goes back exactly where it was cropped, circular feather.
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = Math.max(0, (vh - side) / 2 - side * 0.08);
    const px = Math.round(side * scale);
    if (mask.width !== px) {
      mask.width = px;
      mask.height = px;
    }
    const m = mask.getContext("2d");
    if (!m) return;
    const t = Math.min(1, (performance.now() - switchedAt) / crossfadeMs);
    m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, px, px);
    if (previous) m.drawImage(previous, 0, 0, px, px);
    m.globalAlpha = previous ? t : 1;
    m.drawImage(current, 0, 0, px, px);
    m.globalAlpha = 1;
    const r = px / 2;
    const g = m.createRadialGradient(r, r * 0.92, r * 0.5, r, r * 0.92, r * 0.98);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    m.globalCompositeOperation = "destination-in";
    m.fillStyle = g;
    m.fillRect(0, 0, px, px);
    m.globalCompositeOperation = "source-over";
    ctx.drawImage(mask, dx + sx * scale, dy + sy * scale);
    if (t >= 1 && previous) {
      previous.close();
      previous = null;
    }
  };

  const show = async (blob: Blob) => {
    const bitmap = await createImageBitmap(blob);
    previous?.close();
    previous = current;
    current = bitmap;
    switchedAt = performance.now();
    try {
      const out = document.createElement("canvas");
      out.width = bitmap.width;
      out.height = bitmap.height;
      out.getContext("2d")?.drawImage(bitmap, 0, 0);
      lastDataUrl = out.toDataURL("image/jpeg", 0.92);
    } catch {
      /* snapshot stays on the previous frame */
    }
  };

  const started = performance.now();
  let first = true;

  const tick = async () => {
    if (stopped || inFlight) return; // never queue: skip the frame instead
    const frame = await capture();
    if (!frame || stopped) return;
    inFlight = true;
    try {
      const out = await chain.run(frame, {
        prompt: options.prompt,
        negativePrompt: options.negativePrompt,
        denoise: options.denoise,
        seed: options.seed,
        size,
      });
      if (stopped) return;
      await show(out);
      if (first) {
        first = false;
        options.onFirstFrame?.(Math.round(performance.now() - started));
      }
    } catch (error) {
      // Keep the last good frame on screen; only report the failure.
      options.onError?.(error as Error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  timer = window.setInterval(() => void tick(), intervalMs);
  raf = requestAnimationFrame(render);

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
      previous?.close();
      current?.close();
      previous = null;
      current = null;
    },
    attach: (node) => {
      canvas = node;
    },
    snapshot: () => lastDataUrl,
    bestRaw: () =>
      rawFrames.length
        ? (rawFrames.reduce((best, f) => (f.score > best.score ? f : best)).blob ?? null)
        : null,
    active: () => chain.active,
  };
}
