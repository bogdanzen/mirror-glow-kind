import { lazy, Suspense, useEffect, useRef, useState } from "react";
import butterflyAsset from "@/assets/v4-butterfly-neon.webm.asset.json";

/** Neon butterfly loop with a real alpha channel (no black box). Hidden for reduced motion. */
export function NeonButterfly({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(q.matches);
    update();
    q.addEventListener("change", update);
    const onVis = () => {
      const v = ref.current;
      if (!v) return;
      if (document.hidden) v.pause();
      else void v.play().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      q.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  if (reduce) return <span className={`v4-butterfly ${className}`} aria-hidden />;
  return (
    <video
      ref={ref}
      className={`v4-butterfly ${className}`}
      src={butterflyAsset.url}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
    />
  );
}

const FloatingLines = lazy(() => import("./FloatingLines"));
const LINE_GRADIENT = ["--v4-lines-start", "--v4-lines-mid", "--v4-lines-end"];
const WAVES: ("top" | "middle" | "bottom")[] = ["top", "middle", "bottom"];

export function CampaignLines({ variant }: { variant: "attract" | "countdown" | "lower" | "light" }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (!enabled) return null;
  return (
    <div className={`v4-floating-lines v4-floating-lines-${variant}`} aria-hidden>
      <Suspense fallback={null}>
        <FloatingLines
          linesGradient={LINE_GRADIENT}
          enabledWaves={WAVES}
          lineCount={2}
          lineDistance={64.5}
          animationSpeed={1.6}
          bendRadius={19}
          parallax={false}
          lightMode={variant === "light"}
        />
      </Suspense>
    </div>
  );
}

const ICONS = {
  heart: {
    vb: "0 0 172 150",
    el: <path d="M113.57 12.2725C123.159 5.41073 132.467 3.56588 140.422 4.90918C148.485 6.27076 155.583 10.9767 160.508 17.9297C170.264 31.7031 171.554 54.6342 152.967 76.3525L86.168 143.613L19.3682 76.3516C0.185005 54.0109 1.81131 31.4193 11.6436 17.9854C16.6293 11.1735 23.7704 6.58514 31.7441 5.25293C39.616 3.9378 48.6389 5.74124 57.627 12.292L83.1592 35.2598L86.2393 38.0312L89.2549 35.1895L113.57 12.2725Z" stroke="currentColor" strokeWidth="9" fill="none" />,
  },
  lotus: {
    vb: "0 0 194 150",
    el: <path fill="currentColor" d="M97 0C107.907 14.5461 115.682 31.2054 119.714 48.7031C128.399 35.5043 138.755 28.4341 149.329 24.4678C155.767 43.9821 159.253 62.8257 154.739 81.7158C167.884 73.1036 180.942 69.3422 194 70.2129C190.171 106.383 168.474 141.489 97 150C22.9738 139.362 3.82898 102.128 0 70.2129C13.7773 69.3623 26.9428 72.7629 39.8223 80.8223C35.3566 62.2835 38.7971 44.0512 44.6709 24.4678C55.2455 28.4341 65.6014 35.5043 74.2861 48.7031C78.3178 31.2054 86.0929 14.5461 97 0ZM183.371 79.6191C175.725 80.7789 167.857 83.8814 159.672 89.2441L156.552 91.2871C151.133 106.19 140.714 120.908 123.513 135.786C142.381 130.54 155.506 122.822 164.607 114.012C174.815 104.132 180.544 92.3127 183.371 79.6191ZM10.793 79.4971C13.5323 90.7436 18.8333 101.941 28.5635 111.745C37.6751 120.926 51.1233 129.34 71.0557 135.27C53.7478 119.762 43.3761 105.014 37.9951 90.2959L35.0479 88.4512C26.9887 83.4082 18.9674 80.5072 10.793 79.4971ZM115.668 71.2266L114.911 67.9453C108.84 83.2461 104.281 104.151 102.327 132.812C103.865 130.445 105.399 128.139 106.935 125.899C116.092 107.187 119.522 87.1664 118.053 67.6006L115.668 71.2266ZM141.577 98.0742C132.784 106.474 123.835 117.221 114.719 130.463C114.441 131.023 114.158 131.582 113.87 132.14C127.059 121.352 136.141 110.914 142.149 100.723L140.721 101.66L141.577 98.0742ZM75.9473 67.6016C74.5759 85.8705 77.4748 104.535 85.3174 122.158C87.4153 125.272 89.5123 128.52 91.6104 131.903C89.6222 103.708 85.0946 83.0839 79.0879 67.9453L78.332 71.2266L75.9473 67.6016ZM53.7334 100.144L52.042 99.085C57.8143 109.075 66.5638 119.484 79.3398 130.578C78.6763 129.244 78.0386 127.905 77.4287 126.559C69.1801 114.391 61.0415 104.554 52.9395 96.8486L53.7334 100.144ZM143.758 37.1484C137.925 40.7427 132.307 45.9382 127.232 53.6504L125.72 55.9482C128.243 71.4267 127.944 87.3995 124.435 103.068C131.328 95.1425 138.231 88.4691 145.166 83.0537L145.986 79.624C149.228 66.0559 147.834 52.185 143.758 37.1484ZM50.457 37.2812C46.7192 52.1964 45.3929 65.5148 48.5723 78.7139L49.3525 81.957C56.026 87.0293 62.5819 93.2885 69.0684 100.754C66.031 85.8281 65.8806 70.6636 68.2793 55.9473L66.7676 53.6504C61.7553 46.0329 56.213 40.8704 50.457 37.2812ZM97 16.1416C90.5707 26.9228 85.8453 38.6165 83.0557 50.7236L82.3926 53.6006C88.5932 65.3091 93.6264 80.5351 97 100.381C100.374 80.5353 105.406 65.3091 111.606 53.6006L110.944 50.7236C108.155 38.6165 103.429 26.9228 97 16.1416Z" />,
  },
  search: {
    vb: "0 0 160 155",
    el: (
      <>
        <rect x="115" y="105" width="62" height="9" rx="4.5" transform="rotate(45 115 105)" fill="currentColor" />
        <circle cx="63" cy="63" r="58.5" stroke="currentColor" strokeWidth="9" fill="none" />
      </>
    ),
  },
  shield: {
    vb: "0 0 134 150",
    el: <path d="M129.179 26.3164L123.53 84.6221C121.702 97.2531 114.701 107.969 104.158 117.94C94.0961 127.457 81.1095 136.015 67 144.717C52.8905 136.015 39.9039 127.457 29.8418 117.94C19.2986 107.969 12.2966 97.2531 10.4688 84.6221L4.82031 26.3164L67 4.7627L129.179 26.3164ZM56.8643 87.6084L36.0596 68.3135L33 71.6133L29.9404 74.9121L53.9404 97.1709L57.1348 100.133L60.1992 97.0361L105.199 51.5518L102 48.3867L98.8008 45.2227L56.8643 87.6084Z" stroke="currentColor" strokeWidth="9" fill="none" />,
  },
} as const;

export function PreventionIcon({ name }: { name: keyof typeof ICONS }) {
  const icon = ICONS[name];
  return (
    <svg viewBox={icon.vb} className="v4-icon" aria-hidden>
      {icon.el}
    </svg>
  );
}
