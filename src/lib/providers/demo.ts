import type { FrameOptions, FrameProvider } from "./types";

/**
 * Last link in every chain: no network, no keys, never fails. The frame is
 * graded so the visitor still sees a deliberate, filmic image.
 */
export const demoProvider: FrameProvider = {
  id: "demo",
  label: "Demo (fără AI)",

  async processFrame(frame: Blob, opts: FrameOptions): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(frame);
      const size = opts.size || bitmap.width;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return frame;
      ctx.filter = "grayscale(0.55) contrast(1.12) brightness(0.96)";
      ctx.drawImage(bitmap, 0, 0, size, size);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      return blob ?? frame;
    } catch {
      return frame;
    }
  },

  async health(): Promise<boolean> {
    return true;
  },
};
