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

export async function waitForFace(video: HTMLVideoElement, rotationDeg: number, signal: AbortSignal, intervalMs = 300): Promise<boolean> {
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
      const q = ((Math.round(rotationDeg / 90) % 4) + 4) % 4;
      const w = Math.round(vw * k);
      const h = Math.round(vh * k);
      canvas.width = q % 2 ? h : w;
      canvas.height = q % 2 ? w : h;
      // Detect on the frame the way visitors see it (camera mounting rotation + kiosk flip).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((q * Math.PI) / 2);
      ctx.drawImage(video, -w / 2, -h / 2, w, h);
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
