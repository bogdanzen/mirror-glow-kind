import type { CSSProperties } from "react";

/** Physical camera mounting adjustments (camera sits landscape above a portrait screen). */
export interface CameraView {
  camRotation: number; // 0 | 90 | 180 | 270
  camZoom: number; // 0.3..3; values below 1 reveal more of the camera field of view
  camOffsetX: number; // % of screen width, -50..50
  camOffsetY: number; // % of screen height, -50..50
  camMirror: boolean;
}

export const DEFAULT_CAMERA_VIEW: CameraView = {
  camRotation: 0,
  camZoom: 1,
  camOffsetX: 0,
  camOffsetY: 0,
  camMirror: true,
};

const quarter = (r: number) => ((Math.round(r / 90) % 4) + 4) % 4;

/** Style for a <video object-cover> that fills a W×H container with the given view. */
export function cameraStyle(v: CameraView, w: number, h: number): CSSProperties {
  const swap = quarter(v.camRotation) % 2 === 1;
  const m = v.camMirror ? -1 : 1;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: swap ? h : w,
    height: swap ? w : h,
    maxWidth: "none",
    objectFit: "cover",
    transform: `translate(-50%, -50%) translate(${(v.camOffsetX / 100) * w}px, ${(v.camOffsetY / 100) * h}px) rotate(${quarter(v.camRotation) * 90}deg) scale(${v.camZoom * m}, ${v.camZoom})`,
  };
}

/** Grabs exactly what the viewer sees on a W×H screen as a JPEG (long edge = longEdge). */
export function viewToFile(video: HTMLVideoElement, v: CameraView, screenW: number, screenH: number, longEdge = 768): File | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !screenW || !screenH) return null;
  const k = longEdge / Math.max(screenW, screenH);
  const W = Math.round(screenW * k);
  const H = Math.round(screenH * k);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const q = quarter(v.camRotation);
  const boxW = q % 2 ? H : W;
  const boxH = q % 2 ? W : H;
  const s = Math.max(boxW / vw, boxH / vh);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(W / 2 + (v.camOffsetX / 100) * W, H / 2 + (v.camOffsetY / 100) * H);
  ctx.rotate((q * Math.PI) / 2);
  ctx.scale(v.camZoom * (v.camMirror ? -1 : 1), v.camZoom);
  // clip to the element box (object-cover crops to it)
  ctx.beginPath();
  ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
  ctx.clip();
  ctx.drawImage(video, (-vw * s) / 2, (-vh * s) / 2, vw * s, vh * s);
  const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], "frame.jpg", { type: "image/jpeg" });
}
