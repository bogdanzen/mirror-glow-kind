/**
 * Delayed mirror: the camera is shown a couple of seconds late, and in that
 * window the visitor's head is re-rendered bald by a flash diffusion model and
 * pasted back onto the delayed frame. The body, clothes and background stay
 * the real recording, so only the head is generated.
 */

import {
  cropToFile,
  detectHead,
  fallbackHeadBox,
  loadHeadDetector,
  smoothBox,
  type HeadBox,
} from "./headcrop";

type Frame = { t: number; bitmap: ImageBitmap; box: HeadBox | null };
type Head = { t: number; img: HTMLImageElement; box: HeadBox };

export type DelayMirrorStats = {
  renderFps: number;
  heads: number;
  lastLatencyMs: number;
  detector: boolean;
};

export type DelayMirrorOptions = {
  video: HTMLVideoElement;
  /** Optional at start: buffering and generation can run before the
   *  mirror screen exists, so the first head is ready when it opens. */
  canvas?: HTMLCanvasElement | null;
  /** How far behind real time the picture runs. */
  delayMs: number;
  /** Frames stored per second (memory: ~1 MB each at 720p). */
  bufferFps: number;
  /** Generated heads per second to aim for. */
  genFps: number;
  /** Square size sent to the model. */
  cropSize: number;
  /** Extra room around the detected face, as a fraction. */
  headMargin: number;
  /** Soft edge of the pasted head, in crop pixels. */
  feather: number;
  debug: boolean;
  /** Sends one head crop to the model and resolves with an image URL. */
  generate: (file: File, signal: AbortSignal) => Promise<string>;
  onFirstHead?: () => void;
  onError?: (error: Error) => void;
  onStats?: (stats: DelayMirrorStats) => void;
};

export type DelayMirrorHandle = {
  stop: () => void;
  /** Hands the visible canvas over once the mirror screen is mounted. */
  attach: (canvas: HTMLCanvasElement | null) => void;
  /** Whether at least one generated head is available. */
  ready: () => boolean;
  /** Current composed frame as a data URL, for the capture and QR. */
  snapshot: () => string;
};

const BUFFER_WIDTH = 1280;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Imaginea generată nu s-a putut încărca"));
    img.src = url;
  });
}

export function startDelayMirror(options: DelayMirrorOptions): DelayMirrorHandle {
  const { video, generate } = options;
  let surface: HTMLCanvasElement | null = options.canvas ?? null;
  const controller = new AbortController();
  const { signal } = controller;

  const frames: Frame[] = [];
  const heads: Head[] = [];
  let smoothed: HeadBox | null = null;
  let detectorReady = false;
  let lastLatency = 0;
  let renderFps = 0;
  let previousHead: Head | null = null;
  let headSwitchAt = 0;
  let raf = 0;
  let captureTimer = 0;
  let statsTimer = 0;
  let frameCount = 0;

  void loadHeadDetector().then((d) => (detectorReady = Boolean(d)));

  // ---- capture: raw camera frames into the ring buffer -------------------
  const captureInterval = Math.round(1000 / Math.max(5, options.bufferFps));
  let capturing = false;
  const capture = async () => {
    if (capturing || signal.aborted || !video.videoWidth) return;
    capturing = true;
    try {
      const scale = Math.min(1, BUFFER_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      const bitmap = await createImageBitmap(video, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "medium",
      });
      const now = performance.now();
      const detected = await detectHead(bitmap, width, height, now, options.headMargin);
      smoothed = detected ? smoothBox(smoothed, detected) : smoothed;
      const box = smoothed ?? (detectorReady ? null : fallbackHeadBox(width, height));
      frames.push({ t: now, bitmap, box });
      // Keep a little more than the delay window.
      const cutoff = now - options.delayMs - 1000;
      while (frames.length > 2 && frames[0]!.t < cutoff) frames.shift()!.bitmap.close();
    } catch {
      /* a dropped frame is harmless */
    } finally {
      capturing = false;
    }
  };
  captureTimer = window.setInterval(() => void capture(), captureInterval);

  // ---- generation: bald heads, a few per second --------------------------
  const minGap = 1000 / Math.max(0.5, options.genFps);
  const workers = options.genFps >= 2 ? 3 : 2;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        resolve();
      }, { once: true });
    });

  const runWorker = async (index: number) => {
    await sleep((minGap / workers) * index);
    let backoff = 1500;
    while (!signal.aborted) {
      const frame = frames[frames.length - 1];
      if (!frame?.box) {
        await sleep(200);
        continue;
      }
      const started = performance.now();
      try {
        const file = await cropToFile(frame.bitmap, frame.box, options.cropSize);
        if (!file) {
          await sleep(200);
          continue;
        }
        const url = await generate(file, signal);
        if (signal.aborted) return;
        const img = await loadImage(url);
        if (signal.aborted) return;
        lastLatency = Math.round(performance.now() - started);
        heads.push({ t: frame.t, img, box: frame.box });
        // The delayed picture only needs heads inside the delay window.
        while (heads.length > 12) heads.shift();
        if (heads.length === 1) options.onFirstHead?.();
        backoff = 1500;
        const elapsed = performance.now() - started;
        if (elapsed < minGap) await sleep(minGap - elapsed);
      } catch (error) {
        if (signal.aborted) return;
        const status = (error as { status?: number }).status ?? 0;
        if (status === 429 || status >= 500 || status === 0) {
          await sleep(backoff);
          backoff = Math.min(10000, backoff * 2);
          continue;
        }
        options.onError?.(error as Error);
        return;
      }
    }
  };
  for (let i = 0; i < workers; i += 1) void runWorker(i);

  // ---- render: delayed frame + pasted head -------------------------------
  const maskCanvas = document.createElement("canvas");

  const drawHead = (
    ctx: CanvasRenderingContext2D,
    head: Head,
    box: HeadBox,
    mapX: (v: number) => number,
    mapY: (v: number) => number,
    mapS: number,
    alpha: number,
  ) => {
    const size = Math.max(16, Math.round(box.size * mapS));
    maskCanvas.width = size;
    maskCanvas.height = size;
    const m = maskCanvas.getContext("2d");
    if (!m) return;
    m.clearRect(0, 0, size, size);
    m.drawImage(head.img, 0, 0, size, size);
    // Feathered oval so the paste has no visible border.
    const feather = Math.max(4, (options.feather / options.cropSize) * size);
    const grad = m.createRadialGradient(
      size / 2,
      size / 2,
      Math.max(1, size / 2 - feather),
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    m.globalCompositeOperation = "destination-in";
    m.fillStyle = grad;
    m.fillRect(0, 0, size, size);
    m.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(maskCanvas, mapX(box.x), mapY(box.y), size, size);
    ctx.restore();
  };

  const render = () => {
    raf = requestAnimationFrame(render);
    const canvas = surface;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = performance.now();
    const target = now - options.delayMs;

    let frame: Frame | undefined;
    for (const f of frames) if (f.t <= target) frame = f;
    if (!frame) return;
    frameCount += 1;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(320, Math.round(rect.width * dpr));
    const ch = Math.max(320, Math.round(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    // Cover-fit the delayed frame, exactly like object-cover on the video.
    const scale = Math.max(cw / frame.bitmap.width, ch / frame.bitmap.height);
    const dw = frame.bitmap.width * scale;
    const dh = frame.bitmap.height * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(frame.bitmap, dx, dy, dw, dh);

    const mapX = (v: number) => dx + v * scale;
    const mapY = (v: number) => dy + v * scale;

    // Newest head generated at or before the displayed moment.
    let head: Head | undefined;
    for (const h of heads) if (h.t <= frame.t) head = h;
    head ??= heads[heads.length - 1];

    if (head) {
      if (previousHead !== head) {
        previousHead = previousHead ?? head;
        if (previousHead !== head) headSwitchAt = now;
      }
      const box = frame.box ?? head.box;
      const fade = Math.min(1, (now - headSwitchAt) / 300);
      if (previousHead && previousHead !== head && fade < 1) {
        drawHead(ctx, previousHead, box, mapX, mapY, scale, 1);
        drawHead(ctx, head, box, mapX, mapY, scale, fade);
      } else {
        drawHead(ctx, head, box, mapX, mapY, scale, 1);
        previousHead = head;
      }
      if (fade >= 1) previousHead = head;
    }

    if (options.debug && frame.box) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,84,64,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(mapX(frame.box.x), mapY(frame.box.y), frame.box.size * scale, frame.box.size * scale);
      ctx.restore();
    }
  };
  raf = requestAnimationFrame(render);

  statsTimer = window.setInterval(() => {
    renderFps = frameCount;
    frameCount = 0;
    options.onStats?.({
      renderFps,
      heads: heads.length,
      lastLatencyMs: lastLatency,
      detector: detectorReady,
    });
  }, 1000);

  return {
    stop: () => {
      controller.abort();
      cancelAnimationFrame(raf);
      window.clearInterval(captureTimer);
      window.clearInterval(statsTimer);
      for (const f of frames) f.bitmap.close();
      frames.length = 0;
      heads.length = 0;
    },
    snapshot: () => {
      try {
        return canvas.toDataURL("image/jpeg", 0.92);
      } catch {
        return "";
      }
    },
  };
}
