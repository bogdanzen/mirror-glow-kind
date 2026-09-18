/**
 * Head tracking for the delayed mirror.
 *
 * Runs entirely on the device (MediaPipe face detector, GPU-backed). No frame
 * leaves the kiosk for detection; only the square head crop is sent to the
 * image model afterwards.
 */

export type HeadBox = {
  /** Square crop in source-pixel coordinates. */
  x: number;
  y: number;
  size: number;
  /** Detected face, relative to the square crop. Used to preserve real pixels. */
  face?: { x: number; y: number; width: number; height: number };
};

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type Detector = {
  detectForVideo: (
    source: CanvasImageSource,
    timestamp: number,
  ) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] };
};

let detectorPromise: Promise<Detector | null> | null = null;

/** Loads the detector once; resolves to null when it is unavailable. */
export function loadHeadDetector(): Promise<Detector | null> {
  detectorPromise ??= (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.4,
      });
      return detector as unknown as Detector;
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

/**
 * Turns a face rectangle into a square crop that contains the whole skull:
 * the detector only marks the face, so the box grows upward for the scalp.
 */
export function faceToHeadBox(
  face: { originX: number; originY: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
  margin: number,
): HeadBox {
  const cx = face.originX + face.width / 2;
  const cy = face.originY + face.height / 2;
  const size = Math.max(face.width, face.height) * (1 + margin);
  // Faces sit low inside the skull; shift the square up so hair/scalp fits.
  const finalSize = Math.min(size, Math.min(frameWidth, frameHeight));
  const y = Math.max(0, Math.min(cy - finalSize * 0.58, frameHeight - finalSize));
  const x = Math.max(0, Math.min(cx - finalSize / 2, frameWidth - finalSize));
  return {
    x,
    y,
    size: finalSize,
    face: {
      x: face.originX - x,
      y: face.originY - y,
      width: face.width,
      height: face.height,
    },
  };
}

/** Where the framing oval sits — used when no detector result is available. */
export function fallbackHeadBox(frameWidth: number, frameHeight: number): HeadBox {
  const size = Math.min(frameWidth, frameHeight) * 0.55;
  return { x: (frameWidth - size) / 2, y: frameHeight * 0.16, size };
}

/** Smooths the box so the pasted head does not jitter frame to frame. */
export function smoothBox(previous: HeadBox | null, next: HeadBox, factor = 0.35): HeadBox {
  if (!previous) return next;
  const mix = (a: number, b: number) => a + (b - a) * factor;
  const smoothed: HeadBox = {
    x: mix(previous.x, next.x),
    y: mix(previous.y, next.y),
    size: mix(previous.size, next.size),
  };
  if (previous.face && next.face) {
    smoothed.face = {
      x: mix(previous.face.x, next.face.x),
      y: mix(previous.face.y, next.face.y),
      width: mix(previous.face.width, next.face.width),
      height: mix(previous.face.height, next.face.height),
    };
  } else if (next.face) {
    smoothed.face = next.face;
  }
  return smoothed;
}

/** Detects the head in a frame; returns null when nobody is visible. */
export async function detectHead(
  source: CanvasImageSource & { width?: number; height?: number },
  frameWidth: number,
  frameHeight: number,
  timestampMs: number,
  margin: number,
): Promise<HeadBox | null> {
  const detector = await loadHeadDetector();
  if (!detector) return null;
  try {
    const result = detector.detectForVideo(source, timestampMs);
    const box = result.detections?.[0]?.boundingBox;
    if (!box) return null;
    return faceToHeadBox(box, frameWidth, frameHeight, margin);
  } catch {
    return null;
  }
}

/** Crops the square head region out of a frame and encodes it as a JPEG file. */
export function cropToFile(
  source: CanvasImageSource,
  box: HeadBox,
  size: number,
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, box.x, box.y, box.size, box.size, 0, 0, size, size);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], "head.jpg", { type: "image/jpeg" }) : null),
      "image/jpeg",
      0.92,
    );
  });
}
