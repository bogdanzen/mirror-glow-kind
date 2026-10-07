import { useEffect, useRef, useState } from "react";
import butterflyAsset from "@/assets/v4-butterfly-crossing.webm.asset.json";

/** A single alpha-video crossing, scheduled independently of campaign timers. */
export function V4AmbientButterflies({ visible }: { visible: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [flight, setFlight] = useState<{ direction: string; path: number } | null>(null);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!motion.matches && !document.hidden);
    update();
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    setFlight(null);
    if (!video || !allowed || !visible) {
      video?.pause();
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      if (cancelled) return;
      video.currentTime = 0;
      const next = { direction: Math.random() < 0.5 ? "from-left" : "from-right", path: Math.floor(Math.random() * 3) };
      void video.play().then(() => {
        if (cancelled) video.pause();
        else setFlight(next);
      }).catch(() => setFlight(null));
      timer = setTimeout(start, 10_000 + Math.random() * 2_000);
    };
    timer = setTimeout(start, 1_000 + Math.random() * 2_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.pause();
    };
  }, [allowed, visible]);

  return (
    <div className={`v4-ambient-butterflies ${flight && allowed && visible ? `is-flying ${flight.direction} path-${flight.path}` : ""}`} aria-hidden="true">
      <video ref={videoRef} src={butterflyAsset.url} muted playsInline preload="auto" onEnded={() => setFlight(null)} onError={() => setFlight(null)} />
    </div>
  );
}