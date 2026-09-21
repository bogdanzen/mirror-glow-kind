import type { FrameOptions, FrameProvider } from "./types";

/**
 * The existing WebRTC path (WHIP out / WHEP back), wrapped as a provider:
 * the processed <video> keeps running and the loop just samples it once a
 * second, so the rest of the app sees the same request/response contract.
 */
let processedVideo: HTMLVideoElement | null = null;

export function setScopeVideo(video: HTMLVideoElement | null) {
  processedVideo = video;
}

export const scopeProvider: FrameProvider = {
  id: "scope",
  label: "Scope WebRTC (pod live)",

  async processFrame(_frame: Blob, opts: FrameOptions): Promise<Blob> {
    const video = processedVideo;
    if (!video || !video.videoWidth) throw new Error("Fluxul procesat nu este disponibil");
    const size = opts.size || 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponibil");
    const side = Math.min(video.videoWidth, video.videoHeight);
    ctx.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("Cadrul procesat nu a putut fi citit");
    return blob;
  },

  async health(): Promise<boolean> {
    return Boolean(processedVideo?.videoWidth);
  },
};
