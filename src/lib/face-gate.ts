/**
 * Waits until a face is visible before the portrait frame is taken.
 * Uses the browser's built-in, hardware-accelerated FaceDetector (Shape
 * Detection API) — no library download, no continuous frame loop: it checks a
 * small still a few times per second only while waiting. If the tablet's
 * browser has no FaceDetector, it returns immediately (old behaviour).
 */
type Detector = { detect: (src: CanvasImageSource) => Promise<unknown[]> };

let detector: Detector | null | undefined;
function getDetector(): Detector | null {
  if (detector !== undefined) return detector;
  const Ctor = (window as unknown as { FaceDetector?: new (o: object) => Detector }).FaceDetector;
  try {
    detector = Ctor ? new Ctor({ fastMode: true, maxDetectedFaces: 1 }) : null;
  } catch {
    detector = null;
  }
  return detector;
}

export function faceDetectionSupported() {
  return typeof window !== "undefined" && Boolean(getDetector());
}

export async function waitForFace(video: HTMLVideoElement, flipped: boolean, signal: AbortSignal, intervalMs = 300): Promise<boolean> {
  const d = getDetector();
  if (!d) return true;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  while (!signal.aborted) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw) {
      const k = 480 / Math.max(vw, vh);
      canvas.width = Math.round(vw * k);
      canvas.height = Math.round(vh * k);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (flipped) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const faces = await d.detect(canvas);
        if (faces.length > 0) return true;
      } catch {
        return true; // detector broke: never block the experience
      }
    }
    await new Promise((r) => window.setTimeout(r, intervalMs));
  }
  return false;
}
