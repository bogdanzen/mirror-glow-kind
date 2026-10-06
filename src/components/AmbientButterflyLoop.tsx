import { useEffect, useRef, useState } from "react";
import butterflyAsset from "@/assets/v3-butterfly-swarm.mp4.asset.json";

type AmbientButterflyLoopProps = {
  src?: string;
  visible?: boolean;
};

/** One short decorative clip at a time, with randomized 10–12 second start intervals. */
export function AmbientButterflyLoop({ src = butterflyAsset.url, visible = true }: AmbientButterflyLoopProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(false);
  const [placement, setPlacement] = useState(0);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    setActive(false);
    if (!video || reduceMotion || !visible || !pageVisible) {
      video?.pause();
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      if (cancelled) return;
      video.currentTime = 0;
      setPlacement(Math.floor(Math.random() * 4));
      void video.play().then(() => {
        if (!cancelled) setActive(true);
        else video.pause();
      }).catch(() => setActive(false));
      timer = setTimeout(start, 10_000 + Math.random() * 2_000);
    };
    timer = setTimeout(start, 1_000 + Math.random() * 2_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.pause();
    };
  }, [reduceMotion, visible, pageVisible, src]);

  if (!src || reduceMotion) return null;

  return (
    <div className={`v3-butterfly-layer v3-butterfly-placement-${placement} ${active && visible && pageVisible ? "is-visible" : ""}`} aria-hidden>
      <video ref={videoRef} src={src} muted playsInline preload="auto" onEnded={() => setActive(false)} onError={() => setActive(false)} />
    </div>
  );
}