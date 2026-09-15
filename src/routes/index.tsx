import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { AdminPanel } from "@/components/AdminPanel";
import { saveCapture } from "@/lib/captures";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import {
  appendSessionLog,
  bumpSessionCounter,
  loadSettings,
  type MirrorSettings,
} from "@/lib/settings";
import { startMirrorSession, type MirrorSession, type MirrorStatus } from "@/lib/daydream";
import { GildedBackdrop } from "@/components/GildedBackdrop";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Oglinda — instalație interactivă de conștientizare a cancerului" },
      {
        name: "description",
        content:
          "Privește-te în oglindă: o instalație interactivă care îți arată, live, o altă versiune a ta. Procesare în timp real, fără stocare.",
      },
      { property: "og:title", content: "Oglinda — privește-te în oglindă" },
      {
        property: "og:description",
        content:
          "Instalație interactivă de conștientizare a cancerului. Imaginea este procesată live și nu este stocată.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Kiosk,
});

type Screen = "attract" | "consent" | "framing" | "mirror" | "capture" | "thanks";

function Kiosk() {
  const [settings, setSettings] = useState<MirrorSettings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("attract");
  const [admin, setAdmin] = useState(false);
  const [demo, setDemo] = useState(true);
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string>("");
  const [captureId, setCaptureId] = useState<string>("");
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");
  const [mirrorStatus, setMirrorStatus] = useState<MirrorStatus>("creating");

  const cameraRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const mirrorRef = useRef<HTMLVideoElement | null>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<MirrorSession | null>(null);
  const idleRef = useRef<number>(Date.now());

  useEffect(() => {
    setOrigin(window.location.origin);
    return installKioskHardening();
  }, []);

  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((t) => t.stop());
    cameraRef.current = null;
  }, []);

  const teardownStream = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
  }, []);

  const goAttract = useCallback(() => {
    teardownStream();
    stopCamera();
    setConsent(false);
    setCountdown(null);
    setCaptureUrl("");
    setCaptureId("");
    setError("");
    setScreen("attract");
  }, [stopCamera, teardownStream]);

  // Inactivity watchdog
  useEffect(() => {
    const touch = () => (idleRef.current = Date.now());
    window.addEventListener("pointerdown", touch);
    const id = window.setInterval(() => {
      if (screen === "attract" || admin) return;
      if (screen === "mirror" && mirrorStatus !== "live") {
        idleRef.current = Date.now();
        return;
      }
      if (Date.now() - idleRef.current > settings.idleTimeoutSeconds * 1000) goAttract();
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.clearInterval(id);
    };
  }, [screen, admin, mirrorStatus, settings.idleTimeoutSeconds, goAttract]);

  // Hidden admin: 5 rapid taps top-left
  const tapsRef = useRef<number[]>([]);
  const cornerTap = () => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current, now].filter((t) => now - t < 2500);
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      setAdmin(true);
    }
  };

  const startCamera = useCallback(async () => {
    if (cameraRef.current) return cameraRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: settings.cameraDeviceId
        ? { deviceId: { exact: settings.cameraDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    cameraRef.current = stream;
    return stream;
  }, [settings.cameraDeviceId]);

  // FRAMING: preview + presence heuristic + countdown
  useEffect(() => {
    if (screen !== "framing") return;
    let cancelled = false;
    let raf = 0;
    let stableFrames = 0;
    let lastLuma = 0;

    void (async () => {
      try {
        const stream = await startCamera();
        if (cancelled) return;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => undefined);
        }
      } catch {
        setError("Camera nu este disponibilă.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      const tick = () => {
        if (cancelled) return;
        const v = previewRef.current;
        if (v && v.videoWidth) {
          ctx.drawImage(v, 0, 0, 64, 64);
          const { data } = ctx.getImageData(16, 16, 32, 32);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4)
          for (let i = 0; i < data.length; i += 4)
            sum += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
          const luma = sum / (data.length / 4);
          const motion = Math.abs(luma - lastLuma);
          lastLuma = luma;
          if (luma > 35 && motion < 8) stableFrames += 1;
          else stableFrames = Math.max(0, stableFrames - 2);
          if (stableFrames > 45) {
            startCountdown();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    const startCountdown = () => {
      let n = 3;
      setCountdown(n);
      const id = window.setInterval(() => {
        n -= 1;
        if (n <= 0) {
          window.clearInterval(id);
          setCountdown(null);
          setScreen("mirror");
        } else setCountdown(n);
      }, 1000);
    };

    // Safety: never get stuck framing
    const fallback = window.setTimeout(startCountdown, 12000);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [screen, startCamera]);

  // MIRROR: live AI stream, with silent fallback to demo mode
  useEffect(() => {
    if (screen !== "mirror") return;
    let cancelled = false;

    void (async () => {
      const camera = cameraRef.current ?? (await startCamera().catch(() => null));
      if (!camera || cancelled) return;
      bumpSessionCounter();
      setMirrorStatus("creating");

      const showDemo = async () => {
        setDemo(true);
        setMirrorStatus("live");
        if (mirrorRef.current && !cancelled) {
          mirrorRef.current.srcObject = null;
          mirrorRef.current.srcObject = camera;
          await mirrorRef.current.play().catch(() => undefined);
        }
      };

      if (settings.demoMode) {
        appendSessionLog({ at: Date.now(), status: "demo" });
        await showDemo();
        return;
      }

      const started = performance.now();
      try {
        // Never let a cold cloud/GPU backend stall the exhibit: if the live
        // mirror is not ready quickly, the visitor still gets the experience.
        const session = await Promise.race([
          startMirrorSession({
            settings,
            cameraStream: camera,
            onStatus: (status) => {
              if (!cancelled && status !== "ended") setMirrorStatus(status);
            },
          }),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error("Backendul AI nu a pornit în 15s")),
              15000,
            ),
          ),
        ]);
        if (cancelled) {
          void session.stop();
          return;
        }
        sessionRef.current = session;
        setDemo(false);
        appendSessionLog({
          at: Date.now(),
          status: "live",
          latencyMs: Math.round(performance.now() - started),
        });
        if (session.processedStream && mirrorRef.current) {
          mirrorRef.current.srcObject = null;
          mirrorRef.current.srcObject = session.processedStream;
          await mirrorRef.current.play().catch(() => undefined);
        }
        setMirrorStatus("live");
      } catch (e) {
        appendSessionLog({ at: Date.now(), status: "error", error: (e as Error).message });
        teardownStream();
        if (!cancelled) await showDemo();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, settings, startCamera, teardownStream]);

  // Offline exhibit fallback: keep the live visitor and paint a softly blended,
  // skin-toned shaved scalp over the framed head area. This is intentionally a
  // lightweight canvas effect so the complete experience remains demonstrable
  // when the cloud has no GPU orchestrator.
  useEffect(() => {
    if (screen !== "mirror" || !demo || mirrorStatus !== "live") return;
    let raf = 0;
    // Smoothed head estimate (canvas coordinates).
    let head = { cx: 256, cy: 210, w: 150, h: 190 };
    const render = () => {
      const video = mirrorRef.current;
      const canvas = demoCanvasRef.current;
      if (!video || !canvas || !video.videoWidth) {
        raf = requestAnimationFrame(render);
        return;
      }
      const size = 512;
      if (canvas.width !== size) canvas.width = size;
      if (canvas.height !== size) canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const sourceRatio = video.videoWidth / video.videoHeight;
      const sourceSize = sourceRatio > 1 ? video.videoHeight : video.videoWidth;
      const sx = (video.videoWidth - sourceSize) / 2;
      const sy = (video.videoHeight - sourceSize) / 2;
      ctx.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, size, size);

      // Locate the visitor's face by skin tone so the shaved scalp follows them.
      const frame = ctx.getImageData(0, 0, size, size).data;
      let minX = size, maxX = 0, minY = size, maxY = 0;
      let sr = 0, sg = 0, sb = 0, skin = 0;
      const step = 8;
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const i = (y * size + x) * 4;
          const r0 = frame[i] ?? 0;
          const g0 = frame[i + 1] ?? 0;
          const b0 = frame[i + 2] ?? 0;
          const max = Math.max(r0, g0, b0);
          const min = Math.min(r0, g0, b0);
          const isSkin =
            r0 > 70 && g0 > 40 && b0 > 25 && r0 > g0 && g0 > b0 && r0 - b0 > 12 && max - min > 12;
          if (!isSkin) continue;
          skin += 1;
          sr += r0;
          sg += g0;
          sb += b0;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      let r = 205, g = 170, b = 150;
      if (skin > 40) {
        r = sr / skin;
        g = sg / skin;
        b = sb / skin;
        const faceW = Math.max(70, Math.min(320, maxX - minX));
        const target = {
          cx: (minX + maxX) / 2,
          cy: minY + faceW * 0.55,
          w: faceW * 0.62,
          h: faceW * 0.78,
        };
        const k = 0.15;
        head = {
          cx: head.cx + (target.cx - head.cx) * k,
          cy: head.cy + (target.cy - head.cy) * k,
          w: head.w + (target.w - head.w) * k,
          h: head.h + (target.h - head.h) * k,
        };
      }
      r = Math.min(245, r + 8);
      g = Math.min(232, g + 5);
      b = Math.min(222, b + 3);

      const topY = head.cy - head.h * 0.35;
      const scalp = ctx.createRadialGradient(
        head.cx - head.w * 0.2,
        topY - head.h * 0.35,
        head.w * 0.1,
        head.cx,
        topY,
        head.h * 1.05,
      );
      scalp.addColorStop(0, `rgba(${r + 14},${g + 12},${b + 10},.96)`);
      scalp.addColorStop(0.68, `rgba(${r},${g},${b},.95)`);
      scalp.addColorStop(1, `rgba(${r - 18},${g - 15},${b - 13},0)`);
      ctx.save();
      ctx.filter = "blur(2px)";
      ctx.fillStyle = scalp;
      ctx.beginPath();
      ctx.ellipse(head.cx, topY, head.w, head.h, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(head.cx + head.w, topY + head.h * 0.2);
      ctx.quadraticCurveTo(
        head.cx + head.w * 0.75,
        topY + head.h * 0.58,
        head.cx,
        topY + head.h * 0.5,
      );
      ctx.quadraticCurveTo(
        head.cx - head.w * 0.75,
        topY + head.h * 0.58,
        head.cx - head.w,
        topY + head.h * 0.2,
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [screen, demo, mirrorStatus]);

  // Only start counting the mirror time once the image is actually visible,
  // so a slow warm-up doesn't eat the whole experience.
  useEffect(() => {
    if (screen !== "mirror" || mirrorStatus !== "live") return;
    const id = window.setTimeout(() => {
      if (settings.storageEnabled) setScreen("capture");
      else setScreen("thanks");
    }, settings.mirrorSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [screen, mirrorStatus, settings.storageEnabled, settings.mirrorSeconds]);

  // CAPTURE / THANKS timers
  useEffect(() => {
    if (screen === "capture") {
      const id = window.setTimeout(() => setScreen("thanks"), settings.captureSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    if (screen === "thanks") {
      const id = window.setTimeout(goAttract, settings.thanksSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, settings.captureSeconds, settings.thanksSeconds, goAttract]);

  // Freeze a frame when entering capture
  useEffect(() => {
    if (screen !== "capture") return;
    const v = mirrorRef.current;
    const demoCanvas = demoCanvasRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = demo && demoCanvas?.width ? demoCanvas.width : v.videoWidth;
    canvas.height = demo && demoCanvas?.height ? demoCanvas.height : v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(demo && demoCanvas ? demoCanvas : v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCaptureUrl(dataUrl);
    teardownStream();
    stopCamera();
  }, [screen, demo, stopCamera, teardownStream]);

  const campaign = settings.campaignLine;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <button
        aria-label="admin"
        onClick={cornerTap}
        className="absolute left-0 top-0 z-40 h-24 w-24 opacity-0"
      />

      {screen === "attract" && (
        <section
          onClick={() => {
            void enterFullscreen();
            setScreen("consent");
          }}
          className="flex h-full w-full flex-col items-center justify-center px-[8vw] text-center"
        >
          <GildedBackdrop intense />
          <h1 className="gilded fade-in-slow relative text-[clamp(3rem,10vw,10rem)] leading-none tracking-tight">
            TE VEZI?
          </h1>
          <p className="fade-in-slow relative mt-[5vh] max-w-[22ch] text-[clamp(1.1rem,2.8vw,2.6rem)] leading-snug">
            Oglinda nu îți arată cine ești astăzi.
            <br />
            Îți arată cine ai putea deveni.
          </p>
          <span className="relative mt-[6vh] block h-px w-[22vmin] bg-[linear-gradient(90deg,transparent,var(--gold-2),transparent)]" />
          <p className="breathe relative mt-[6vh] text-[clamp(1.1rem,2.6vw,2.4rem)] tracking-[0.08em] text-primary">
            Atinge ecranul pentru a începe
          </p>
          <p className="absolute bottom-[6vh] left-1/2 -translate-x-1/2 text-[clamp(0.8rem,1.6vw,1.4rem)] tracking-[0.18em] text-muted-foreground">
            {campaign}
          </p>
          <div className="absolute bottom-[5vh] right-[5vw] flex flex-col items-center gap-3">
            <QrCode value={origin} size={140} />
            <span className="text-[clamp(0.7rem,1.2vw,1rem)] text-muted-foreground">
              Încearcă și de pe telefonul tău
            </span>
          </div>
        </section>
      )}


      {screen === "consent" && (
        <section className="fade-in-slow flex h-full flex-col justify-center px-[8vw]">
          <h2 className="text-[clamp(2rem,5vw,5rem)]">Înainte de a începe</h2>
          <div className="mt-[5vh] max-w-[46ch] space-y-6 text-[clamp(1rem,2.2vw,2rem)] leading-relaxed text-muted-foreground">
            <p>Imaginea ta este procesată live, în cloud, doar în memorie.</p>
            <p>Nu se salvează nimic. Nimic nu te identifică.</p>
            <p>Poți pleca oricând — totul dispare în aceeași secundă.</p>
          </div>

          <button
            onClick={() => setConsent((c) => !c)}
            className="mt-[6vh] flex items-center gap-6 text-left text-[clamp(1rem,2.2vw,2rem)]"
          >
            <span
              className={`flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center border ${
                consent ? "border-primary text-primary" : "border-hairline"
              }`}
            >
              {consent ? "✓" : ""}
            </span>
            Am citit și sunt de acord.
          </button>

          <button
            disabled={!consent}
            onClick={() => setScreen("framing")}
            className={`mt-[7vh] w-full hairline-t hairline-b py-[3vh] text-[clamp(1.4rem,3.4vw,3rem)] ${
              consent ? "text-primary" : "text-muted-foreground/40"
            }`}
          >
            Continuă
          </button>

          <div className="mt-[5vh] flex items-center justify-between text-[clamp(0.85rem,1.6vw,1.3rem)] text-muted-foreground">
            <a href="/gdpr" className="underline underline-offset-8">
              Notă de confidențialitate
            </a>
            <button onClick={goAttract}>Renunț</button>
          </div>
        </section>
      )}

      {screen === "framing" && (
        <section className="relative h-full w-full">
          <video
            ref={previewRef}
            muted
            playsInline
            className="h-full w-full scale-x-[-1] object-cover opacity-70"
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="h-[46vh] w-[34vh] rounded-[50%] border border-[--color-foreground]/50" />
            <p className="mt-[6vh] px-[8vw] text-center text-[clamp(1.1rem,2.4vw,2.2rem)]">
              Stai în fața ecranului, la un pas distanță.
            </p>
            {countdown !== null && (
              <p className="mt-[4vh] text-[clamp(4rem,14vw,12rem)] text-primary">{countdown}</p>
            )}
            {error && <p className="mt-6 text-primary">{error}</p>}
          </div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="relative flex h-full w-full flex-col items-center justify-center bg-background">
          <GildedBackdrop />
          <div className="relative aspect-square w-[88vmin] max-w-[92vw] overflow-hidden shadow-[0_0_120px_color-mix(in_oklab,var(--gold-2)_28%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--gold-2)_45%,transparent)]">

            <video
              ref={mirrorRef}
              muted
              playsInline
              className="h-full w-full scale-x-[-1] object-cover transition-opacity duration-[600ms]"
              style={{
                opacity: mirrorStatus === "live" && !demo ? 1 : 0,
                maskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
              }}
            />
            <canvas
              ref={demoCanvasRef}
              aria-label="Simulare live a capului ras"
              className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-[600ms] ${
                demo && mirrorStatus === "live" ? "opacity-100" : "opacity-0"
              }`}
              style={{
                maskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
              }}
            />
            {mirrorStatus !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                <div className="breathe h-[22vmin] w-[22vmin] rounded-full bg-primary/10 blur-[60px]" />
                <p className="absolute text-[clamp(1.1rem,2.4vw,2.2rem)] text-muted-foreground">
                  Se pregătește oglinda…
                </p>
              </div>
            )}
          </div>

          {demo && mirrorStatus === "live" && (
            <span className="absolute right-[4vw] top-[4vh] border border-hairline px-4 py-2 text-[clamp(0.7rem,1.2vw,1rem)] tracking-[0.3em] text-muted-foreground">
              DEMO
            </span>
          )}
          <p className="absolute bottom-[5vh] left-1/2 w-full -translate-x-1/2 text-center text-[clamp(0.9rem,1.8vw,1.6rem)] text-foreground/80">
            {campaign}
          </p>
        </section>
      )}

      {screen === "capture" && (
        <section className="fade-in-slow flex h-full flex-col items-center justify-center px-[8vw] text-center">
          {captureUrl && (
            <img
              src={captureUrl}
              alt="Imaginea ta"
              className="max-h-[45vh] scale-x-[-1] object-contain"
            />
          )}
          {!captureId ? (
            <button
              onClick={() => captureUrl && setCaptureId(saveCapture(captureUrl))}
              className="mt-[6vh] w-full hairline-t hairline-b py-[3vh] text-[clamp(1.4rem,3.2vw,2.8rem)] text-primary"
            >
              Păstrează imaginea
            </button>
          ) : (
            <div className="mt-[6vh] flex flex-col items-center gap-6">
              <QrCode value={`${origin}/r/${captureId}`} size={200} />
              <p className="text-[clamp(0.9rem,1.8vw,1.5rem)] text-muted-foreground">
                Scanează pentru a descărca. Imaginea se șterge în 24 de ore.
              </p>
            </div>
          )}
          <button
            onClick={() => setScreen("thanks")}
            className="mt-[5vh] text-[clamp(0.9rem,1.6vw,1.3rem)] text-muted-foreground underline underline-offset-8"
          >
            Continuă
          </button>
        </section>
      )}

      {screen === "thanks" && (
        <section className="fade-in-slow relative flex h-full flex-col items-center justify-center px-[8vw] text-center">
          <GildedBackdrop />
          <h2 className="gilded relative text-[clamp(2.5rem,8vw,8rem)]">TE VEZI?</h2>
          <p className="relative mt-[5vh] max-w-[24ch] text-[clamp(1.1rem,2.6vw,2.4rem)] leading-snug">
            Oglinda nu îți arată cine ești astăzi.
            <br />
            Îți arată cine ai putea deveni.
          </p>
          <span className="relative mt-[5vh] block h-px w-[18vmin] bg-[linear-gradient(90deg,transparent,var(--gold-2),transparent)]" />
          <p className="relative mt-[5vh] text-[clamp(1rem,2.4vw,2.2rem)] tracking-[0.12em] text-primary">
            {campaign}
          </p>
          <p className="relative mt-[4vh] max-w-[30ch] text-[clamp(0.95rem,2vw,1.8rem)] uppercase tracking-[0.06em] text-foreground/80">
            Tu ce alegi să faci după ce te-ai văzut?
          </p>
          <p className="gilded relative mt-[7vh] text-[clamp(0.9rem,1.7vw,1.4rem)] tracking-[0.42em]">
            PENTRU VIAȚĂ
          </p>
        </section>
      )}


      {admin && (
        <AdminPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setAdmin(false)}
        />
      )}
    </main>
  );
}
