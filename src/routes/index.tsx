import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { AdminPanel } from "@/components/AdminPanel";
import { saveCapture } from "@/lib/captures";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import {
  DEFAULT_SETTINGS,
  appendSessionLog,
  bumpSessionCounter,
  loadSettings,
  saveSettings,
  type MirrorSettings,
} from "@/lib/settings";
import {
  getCamera,
  prewarmMirror,
  startMirrorSession,
  subscribeMirrorWarm,
  type MirrorSession,
  type MirrorStatus,
} from "@/lib/mirror";
import type { WarmState } from "@/lib/scope";
import { GildedBackdrop } from "@/components/GildedBackdrop";
import { DiagOverlay } from "@/components/DiagOverlay";


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
  // Start from defaults so the server and the first client render agree;
  // stored settings are applied right after hydration.
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
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
  const [statusDetail, setStatusDetail] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [warm, setWarm] = useState<WarmState>({
    stage: "idle",
    detail: "",
    fatal: false,
    since: 0,
  });

  const cameraRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const mirrorRef = useRef<HTMLVideoElement | null>(null);

  const sessionRef = useRef<MirrorSession | null>(null);
  /** Stops the repeating fallback transformation loop. */
  const loopRef = useRef<AbortController | null>(null);
  const idleRef = useRef<number>(Date.now());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    setOrigin(window.location.origin);
    setSettings(loadSettings());
    setHydrated(true);
    return installKioskHardening();
  }, []);

  // Live warm-up state for diagnostics.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void subscribeMirrorWarm(setWarm).then((fn) => (unsub = fn));
    return () => unsub?.();
  }, []);

  // PRE-WARM: one owner only. Keyed on the pipeline, never on the whole
  // settings object — re-running this is what hammered the GPU with
  // concurrent downloads and corrupted the model files.
  const pipeline = settings.scopePipeline;
  const prewarmOn =
    settings.prewarm && !settings.demoMode && !settings.fallbackMode && hydrated;
  useEffect(() => {
    if (!prewarmOn) return;
    let cancelled = false;
    void prewarmMirror(settingsRef.current, (_s, detail) => {
      if (!cancelled && detail) setStatusDetail(detail);
    }).catch((e: Error) => {
      if (!cancelled) setStatusDetail(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [prewarmOn, pipeline]);


  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((t) => t.stop());
    cameraRef.current = null;
  }, []);

  const teardownStream = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void session.stop();
    loopRef.current?.abort();
    loopRef.current = null;
  }, []);

  const goAttract = useCallback(() => {
    teardownStream();
    stopCamera();
    setConsent(false);
    setCountdown(null);
    setCaptureUrl("");
    setCaptureId("");
    setFallbackUrl("");
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
    const stream = await getCamera(settingsRef.current);
    cameraRef.current = stream;
    return stream;
  }, []);

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

  // MIRROR: live AI stream. Never restarts because an unrelated setting changed.
  useEffect(() => {
    if (screen !== "mirror") return;
    let cancelled = false;

    void (async () => {
      const current = settingsRef.current;
      const camera = cameraRef.current ?? (await startCamera().catch(() => null));
      if (!camera || cancelled) return;
      bumpSessionCounter();
      setMirrorStatus("creating");

      if (current.demoMode) {
        appendSessionLog({ at: Date.now(), status: "demo" });
        setDemo(true);
        setMirrorStatus("live");
        if (mirrorRef.current) {
          mirrorRef.current.srcObject = camera;
          await mirrorRef.current.play().catch(() => undefined);
        }
        return;
      }

      // FALLBACK: no GPU. One frame is re-rendered on the server as a
      // photorealistic bald portrait and held on screen.
      if (current.fallbackMode) {
        setDemo(false);
        setFallbackUrl("");
        setStatusDetail("Se transformă imaginea…");
        setMirrorStatus("publishing");
        if (mirrorRef.current) {
          mirrorRef.current.srcObject = camera;
          await mirrorRef.current.play().catch(() => undefined);
        }
        try {
          const { frameToFile, baldifyFrame, startBaldLoop } = await import("@/lib/bald");
          // Let the camera settle and auto-expose before grabbing the frame.
          await new Promise((r) => setTimeout(r, 1200));
          const v = mirrorRef.current;
          const t0 = performance.now();
          let logged = false;
          const show = (url: string, isFinal: boolean) => {
            if (cancelled) return;
            setFallbackUrl(url);
            setMirrorStatus("live");
            if (isFinal && !logged) {
              logged = true;
              appendSessionLog({
                at: Date.now(),
                status: "demo",
                latencyMs: Math.round(performance.now() - t0),
              });
            }
          };

          if (current.fallbackRefresh === "off") {
            const file = v ? frameToFile(v) : null;
            if (!file) throw new Error("Nu am putut prelua imaginea de la cameră");
            await baldifyFrame(
              file,
              current.fallbackPrompt,
              show,
              undefined,
              current.fallbackModel,
            );
          } else {
            const controller = new AbortController();
            loopRef.current = controller;
            startBaldLoop({
              getFrame: () => (mirrorRef.current ? frameToFile(mirrorRef.current) : null),
              prompt: current.fallbackPrompt,
              model: current.fallbackModel,
              concurrency: current.fallbackRefresh === "fast" ? 2 : 1,
              onFrame: show,
              onError: (err) => {
                if (cancelled || logged) return;
                appendSessionLog({ at: Date.now(), status: "error", error: err.message });
                setError(err.message);
                setMirrorStatus("error");
              },
              signal: controller.signal,
            });
          }
        } catch (e) {
          if (!cancelled) {
            appendSessionLog({ at: Date.now(), status: "error", error: (e as Error).message });
            setError((e as Error).message);
            setMirrorStatus("error");
          }
        }
        return;
      }

      const started = performance.now();
      try {
        const session = await startMirrorSession({
          settings: current,
          cameraStream: camera,
          onStatus: (status, detail) => {
            if (cancelled) return;
            if (status !== "ended") setMirrorStatus(status);
            if (detail) setStatusDetail(detail);
          },
        });
        if (cancelled) {
          void session.stop();
          return;
        }
        sessionRef.current = session;
        setDemo(false);
        appendSessionLog({
          at: Date.now(),
          status: "live",
          latencyMs: session.startupMs ?? Math.round(performance.now() - started),
        });
        if (session.processedStream && mirrorRef.current) {
          mirrorRef.current.srcObject = session.processedStream;
          await mirrorRef.current.play().catch(() => undefined);
        }
        setMirrorStatus("live");
      } catch (e) {
        appendSessionLog({ at: Date.now(), status: "error", error: (e as Error).message });
        teardownStream();
        if (!cancelled) {
          setError((e as Error).message);
          setMirrorStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      loopRef.current?.abort();
      loopRef.current = null;
    };
  }, [screen, startCamera, teardownStream]);


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

  // Freeze a frame when entering capture, upscaled for the 4K presentation.
  useEffect(() => {
    if (screen !== "capture") return;
    if (fallbackUrl) {
      setCaptureUrl(fallbackUrl);
      teardownStream();
      stopCamera();
      return;
    }
    const v = mirrorRef.current;
    if (!v || !v.videoWidth) return;
    const target = 2048;
    const scale = Math.min(target / v.videoWidth, target / v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    setCaptureUrl(canvas.toDataURL("image/jpeg", 0.92));
    teardownStream();
    stopCamera();
  }, [screen, stopCamera, teardownStream, fallbackUrl]);

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
          <h1 className="gilded fade-in-slow relative font-display text-[clamp(3.5rem,12vw,11rem)] leading-[0.92] tracking-[-0.02em]">
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
          <h2 className="font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.015em]">Înainte de a începe</h2>
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
              <p className="mt-[4vh] font-display text-[clamp(5rem,16vw,13rem)] leading-none text-primary">{countdown}</p>
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
                opacity:
                  mirrorStatus === "live" ||
                  (settings.fallbackMode && mirrorStatus === "publishing")
                    ? 1
                    : 0,
                maskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
              }}
            />
            {fallbackUrl && (
              <img
                src={fallbackUrl}
                alt="Portret transformat"
                className="fade-in-slow absolute inset-0 h-full w-full scale-x-[-1] object-cover"
                style={{
                  maskImage:
                    "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse at center, black 55%, rgba(0,0,0,0.65) 78%, transparent 100%)",
                }}
              />
            )}
            {settings.fallbackMode && mirrorStatus === "publishing" && (
              <p className="absolute bottom-[4%] left-0 w-full text-center text-[clamp(0.9rem,1.8vw,1.5rem)] text-foreground/80">
                Se transformă imaginea…
              </p>
            )}
            {mirrorStatus !== "live" && !(settings.fallbackMode && mirrorStatus === "publishing") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                <div className="breathe h-[22vmin] w-[22vmin] rounded-full bg-primary/10 blur-[60px]" />
                <div className="absolute px-[6vw] text-center">
                  <p className="text-[clamp(1.1rem,2.4vw,2.2rem)] text-muted-foreground">
                    {mirrorStatus === "error" && error ? error : "Se pregătește oglinda…"}
                  </p>
                  {statusDetail && mirrorStatus !== "error" && (
                    <p className="mt-4 text-[clamp(0.8rem,1.4vw,1.2rem)] text-muted-foreground/70">
                      {statusDetail}
                    </p>
                  )}
                </div>
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
          <h2 className="gilded relative font-display text-[clamp(3rem,9vw,9rem)] leading-[0.92] tracking-[-0.02em]">TE VEZI?</h2>
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


      {settings.diagnostics && !admin && (
        <>
          <span className="absolute left-[4vw] top-[4vh] z-40 border border-hairline px-3 py-1 font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
            {`GPU: ${warm.stage.toUpperCase()}${warm.detail ? ` (${warm.detail})` : ""} · ${screen} · ${mirrorStatus}`}
          </span>
          <DiagOverlay
            onClose={() => {
              const next = { ...settings, diagnostics: false };
              saveSettings(next);
              setSettings(next);
            }}
          />
        </>
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
