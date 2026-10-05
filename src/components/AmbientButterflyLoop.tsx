import { useEffect, useRef, useState } from "react";

type AmbientButterflyLoopProps = {
  src?: string;
  visible?: boolean;
};

/** Optional full-screen layer for the transparent butterfly loop supplied later. */
export function AmbientButterflyLoop({ src, visible = true }: AmbientButterflyLoopProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion || !visible) {
      video?.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [reduceMotion, visible, src]);

  if (!src || reduceMotion) return null;

  return (
    <div className={`v3-butterfly-layer ${visible ? "is-visible" : ""}`} aria-hidden>
      <video ref={videoRef} src={src} muted loop playsInline preload="metadata" />
    </div>
  );
}