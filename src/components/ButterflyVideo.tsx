import { useEffect, useRef } from "react";

// Soft hot-pink particles drifting upward. Replaces the butterflies for now.
export function ButterflyVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = canvas.clientWidth;
      h = canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const pink = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#ff2d8a";
    const spawn = (y?: number) => ({
      x: Math.random() * w,
      y: y ?? h + Math.random() * 40,
      r: 0.6 + Math.random() * 2.4,
      vy: 0.15 + Math.random() * 0.5,
      drift: Math.random() * Math.PI * 2,
      a: 0.25 + Math.random() * 0.6,
    });
    const count = Math.round((w * h) / 9000);
    const ps = Array.from({ length: Math.min(260, Math.max(60, count)) }, () => spawn(Math.random() * h));
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = pink;
      ctx.shadowColor = pink;
      for (const p of ps) {
        p.y -= p.vy;
        p.drift += 0.01;
        p.x += Math.sin(p.drift) * 0.3;
        if (p.y < -10) Object.assign(p, spawn());
        ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.drift * 3));
        ctx.shadowBlur = p.r * 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas aria-hidden ref={ref} className={`pointer-events-none ${className}`} />;
}
