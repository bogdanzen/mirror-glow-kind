import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { AdminPanel } from "@/components/AdminPanel";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import {
  DEFAULT_SETTINGS,
  appendSessionLog,
  bumpSessionCounter,
  loadSettings,
  recordModelTiming,
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
import { CancerRibbon, NeonButterfly } from "@/components/NeonButterfly";
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

type Screen =
  | "attract"
  | "consent"
  | "framing"
  | "mirror"
  | "choice"
  | "healthy"
  | "capture";

function Kiosk() {
  // Start from defaults so the server and the first client render agree;
  // stored settings are applied right after hydration.
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>("attract");
  const [admin, setAdmin] = useState(false);
  const [demo, setDemo] = useState(true);
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(5);
  const [presenceSeconds, setPresenceSeconds] = useState(20);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState("");
  const [mirrorStatus, setMirrorStatus] = useState<MirrorStatus>("creating");
  const [statusDetail, setStatusDetail] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  /** Previous portrait, kept underneath so refreshes crossfade. */
  const [prevFallbackUrl, setPrevFallbackUrl] = useState("");
  const fallbackUrlRef = useRef("");
  /** Last fully finished portrait — used for the capture and QR. */
  const finalFallbackRef = useRef("");
  const [warm, setWarm] = useState<WarmState>({
    stage: "idle",
    detail: "",
    fatal: false,
    since: 0,
  });

  const cameraRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const mirrorRef = useRef<HTMLVideoElement | null>(null);
  const healthyRef = useRef<HTMLVideoElement | null>(null);

  /** Delayed mirror: canvas that shows the composed picture. */
  const mirrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const delayRef = useRef<{
    stop: () => void;
    attach: (c: HTMLCanvasElement | null) => void;
    ready: () => boolean;
    snapshot: () => string;
  } | null>(null);
  /** Off-screen video that feeds the delayed mirror from the countdown on. */
  const feedRef = useRef<HTMLVideoElement | null>(null);
  const [delayed, setDelayed] = useState(false);

  const sessionRef = useRef<MirrorSession | null>(null);
  /** Stops the repeating fallback transformation loop. */
  const loopRef = useRef<AbortController | null>(null);
  /** The portrait work starts during the countdown, so it runs only once. */
  const fallbackStartedRef = useRef(false);
  const fallbackCancelRef = useRef(false);
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
    if (delayRef.current) {
      finalFallbackRef.current = delayRef.current.snapshot() || finalFallbackRef.current;
      delayRef.current.stop();
      delayRef.current = null;
    }
    if (feedRef.current) {
      feedRef.current.srcObject = null;
      feedRef.current = null;
    }
    setDelayed(false);
  }, []);

  const goAttract = useCallback(() => {
    teardownStream();
    stopCamera();
    setConsent(false);
    setCountdown(null);
    setPresenceSeconds(20);
    setFallbackUrl("");
    setPrevFallbackUrl("");
    fallbackUrlRef.current = "";
    finalFallbackRef.current = "";
    fallbackStartedRef.current = false;
    fallbackCancelRef.current = true;
    setError("");
    setScreen("attract");
  }, [stopCamera, teardownStream]);

  /**
   * Server portrait work. Started already during the ten-second countdown so
   * the transformed face is on screen the moment the mirror opens.
   */
  const startFallbackWork = useCallback(async () => {
    if (fallbackStartedRef.current) return;
    fallbackStartedRef.current = true;
    fallbackCancelRef.current = false;
    const current = settingsRef.current;
    setDemo(false);
    setFallbackUrl("");
    setPrevFallbackUrl("");
    fallbackUrlRef.current = "";
    finalFallbackRef.current = "";
    setStatusDetail(current.messages.mirrorWorking);
    setMirrorStatus("publishing");

    // DELAYED MIRROR: the camera runs a couple of seconds late and the head is
    // regenerated bald in that window, then pasted back onto the real frame.
    if (current.mirrorEngine === "delayed") {
      try {
        const [{ startDelayMirror }, { falHead, sdxlPrompt, SDXL_NEGATIVE_PROMPT }] =
          await Promise.all([import("@/lib/delaymirror"), import("@/lib/bald")]);
        const camera = cameraRef.current ?? (await startCamera());
        const feed = document.createElement("video");
        feed.muted = true;
        feed.playsInline = true;
        feed.srcObject = camera;
        await feed.play().catch(() => undefined);
        feedRef.current = feed;
        setDelayed(true);
        const started = performance.now();
        let logged = false;
        delayRef.current = startDelayMirror({
          video: feed,
          canvas: mirrorCanvasRef.current,
          delayMs: current.delayMs,
          bufferFps: 15,
          genFps: current.genFps,
          cropSize: current.cropSize,
          headMargin: current.headMargin,
          feather: current.featherPx,
          debug: current.headDebug,
          generate: async (file, signal) => {
            const t = performance.now();
            const url = await falHead(
              file,
              sdxlPrompt(current.sdxlDetail),
              {
                key: current.falKey,
                model: current.falModel,
                strength: current.falStrength,
                steps: current.falSteps,
                seed: current.falSeed,
                size: current.cropSize,
                negativePrompt: SDXL_NEGATIVE_PROMPT,
              },
              signal,
            );
            recordModelTiming(current.falModel, performance.now() - t);
            return url;
          },
          onFirstHead: () => {
            if (fallbackCancelRef.current) return;
            setMirrorStatus("live");
            if (!logged) {
              logged = true;
              appendSessionLog({
                at: Date.now(),
                status: "demo",
                latencyMs: Math.round(performance.now() - started),
              });
            }
          },
          onStats: (stats) =>
            setStatusDetail(
              `${stats.renderFps} fps · cap nou la ${stats.lastLatencyMs} ms · ${
                stats.detector ? "urmărire activă" : "fără detector"
              }`,
            ),
          onError: (err) => {
            if (fallbackCancelRef.current) return;
            appendSessionLog({ at: Date.now(), status: "error", error: err.message });
            setError(err.message);
            setMirrorStatus("error");
          },
        });
      } catch (e) {
        appendSessionLog({ at: Date.now(), status: "error", error: (e as Error).message });
        setError((e as Error).message);
        setMirrorStatus("error");
      }
      return;
    }

    try {
      const { frameToFile, baldifyFrame, startBaldLoop, falFrame } = await import("@/lib/bald");
      const fal =
        current.fallbackProvider === "fal"
          ? {
              key: current.falKey,
              model: current.falModel,
              strength: current.falStrength,
              steps: current.falSteps,
            }
          : undefined;
      // Whichever video element is currently showing the camera.
      const pick = () => {
        for (const v of [previewRef.current, mirrorRef.current]) {
          if (v && v.videoWidth) return frameToFile(v);
        }
        return null;
      };
      // Let the camera settle and auto-expose before grabbing the frame.
      await new Promise((r) => setTimeout(r, 1200));
      const t0 = performance.now();
      let logged = false;
      const show = (url: string, isFinal: boolean) => {
        if (fallbackCancelRef.current) return;
        if (fallbackUrlRef.current) setPrevFallbackUrl(fallbackUrlRef.current);
        fallbackUrlRef.current = url;
        setFallbackUrl(url);
        setMirrorStatus("live");
        if (isFinal) finalFallbackRef.current = url;
        if (isFinal) {
          recordModelTiming(fal ? current.falModel : current.fallbackModel, performance.now() - t0);
        }
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
        const file = pick();
        if (!file) throw new Error("Nu am putut prelua imaginea de la cameră");
        if (fal) await falFrame(file, current.fallbackPrompt, fal, show);
        else await baldifyFrame(file, current.fallbackPrompt, show, undefined, current.fallbackModel);
      } else {
        const controller = new AbortController();
        loopRef.current = controller;
        startBaldLoop({
          getFrame: pick,
          prompt: current.fallbackPrompt,
          model: current.fallbackModel,
          ...(fal ? { fal } : {}),
          // The flash model answers in under a second, so more requests fit.
          concurrency: fal ? 2 : current.fallbackRefresh === "fast" ? 2 : 1,
          onFrame: show,
          onError: (err) => {
            if (fallbackCancelRef.current || logged) return;
            appendSessionLog({ at: Date.now(), status: "error", error: err.message });
            setError(err.message);
            setMirrorStatus("error");
          },
          signal: controller.signal,
        });
      }
    } catch (e) {
      if (fallbackCancelRef.current) return;
      appendSessionLog({ at: Date.now(), status: "error", error: (e as Error).message });
      setError((e as Error).message);
      setMirrorStatus("error");
    }
  }, []);

  // Keep status fresh during the timed story. The final screen owns its
  // explicit 20-second presence check below.
  useEffect(() => {
    const touch = () => (idleRef.current = Date.now());
    window.addEventListener("pointerdown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
    };
  }, []);

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

  // CAMERA INTRO: the configured quiet countdown with their real reflection.
  useEffect(() => {
    if (screen !== "framing") return;
    let cancelled = false;
    let interval = 0;

    void (async () => {
      try {
        const stream = await startCamera();
        if (cancelled) return;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => undefined);
        }
        if (cancelled) return;
        // Use the countdown to already render the portrait.
        const current = settingsRef.current;
        if (current.fallbackMode && !current.demoMode) void startFallbackWork();
        let n = current.framingSeconds;
        setCountdown(n);
        interval = window.setInterval(() => {
          n -= 1;
          if (n <= 0) {
            window.clearInterval(interval);
            setCountdown(null);
            setScreen("mirror");
          } else {
            setCountdown(n);
          }
        }, 1000);
      } catch {
        setError("Camera nu este disponibilă.");
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [screen, startCamera, startFallbackWork]);

  // MIRROR: live AI stream. Never restarts because an unrelated setting changed.
  useEffect(() => {
    if (screen !== "mirror") return;
    let cancelled = false;

    void (async () => {
      const current = settingsRef.current;
      const camera = cameraRef.current ?? (await startCamera().catch(() => null));
      if (!camera || cancelled) return;
      bumpSessionCounter();
      // Don't wipe the status when the portrait is already being generated.
      if (!fallbackStartedRef.current) setMirrorStatus("creating");

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
        if (mirrorRef.current) {
          mirrorRef.current.srcObject = camera;
          await mirrorRef.current.play().catch(() => undefined);
        }
        // Usually already running since the countdown; this is the safety net.
        void startFallbackWork();
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
  }, [screen, startCamera, teardownStream, startFallbackWork]);


  // Only start counting the mirror time once the image is actually visible,
  // so a slow warm-up doesn't eat the whole experience.
  useEffect(() => {
    if (screen !== "mirror" || mirrorStatus !== "live") return;
    const id = window.setTimeout(() => {
      setScreen("choice");
    }, settings.mirrorSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [screen, mirrorStatus, settings.storageEnabled, settings.mirrorSeconds]);

  // Official dramatic beats after the altered reflection.
  useEffect(() => {
    if (screen === "choice") {
      teardownStream();
      const id = window.setTimeout(() => setScreen("healthy"), 7000);
      return () => window.clearTimeout(id);
    }
    if (screen === "healthy") {
      const video = healthyRef.current;
      if (video && cameraRef.current) {
        video.srcObject = cameraRef.current;
        void video.play().catch(() => undefined);
      }
      const id = window.setTimeout(() => setScreen("capture"), 12000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, teardownStream]);

  // Final presence check. Any interaction confirms the visitor is still here.
  useEffect(() => {
    if (screen !== "capture") return;
    setPresenceSeconds(20);
    const id = window.setInterval(() => {
      setPresenceSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(id);
          window.setTimeout(goAttract, 0);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, goAttract]);

  const m = settings.messages;

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
          className="neon-stage flex h-full w-full flex-col items-center justify-center px-[8vw] text-center"
        >
          <div className="kiosk-noise" aria-hidden />
          <NeonButterfly className="absolute left-[10vw] top-[14vh] w-[28vw]" />
          <NeonButterfly className="absolute bottom-[16vh] right-[8vw] w-[18vw]" delay="-4s" reverse />
          <p className="relative mb-[3vh] text-[clamp(0.8rem,1.5vw,1.3rem)] uppercase tracking-[0.42em] text-muted-foreground">
            {m.attractKicker}
          </p>
          <h1 className="neon-title fade-in-slow relative font-display text-[clamp(4.5rem,14vw,13rem)] leading-[0.86]">
            {m.attractTitle}
          </h1>
          <p className="fade-in-slow relative mt-[5vh] max-w-[24ch] whitespace-pre-line text-[clamp(1.1rem,2.8vw,2.6rem)] leading-snug text-foreground/85">
            {m.attractSubtitle}
          </p>
          <span className="relative mt-[6vh] block h-px w-[22vmin] bg-primary" />
          <p className="breathe relative mt-[6vh] text-[clamp(1.1rem,2.6vw,2.4rem)] text-primary">
            {m.attractCta}
          </p>
        </section>
      )}


      {screen === "consent" && (
        <section className="fade-in-slow flex h-full flex-col justify-center px-[8vw]">
          <h2 className="font-display text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.015em]">{m.consentTitle}</h2>
          <div className="mt-[5vh] max-w-[46ch] space-y-6 whitespace-pre-line text-[clamp(1rem,2.2vw,2rem)] leading-relaxed text-muted-foreground">
            {m.consentBody}
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
            {m.consentCheckbox}
          </button>

          <button
            disabled={!consent}
            onClick={() => setScreen("framing")}
            className={`mt-[7vh] w-full hairline-t hairline-b py-[3vh] text-[clamp(1.4rem,3.4vw,3rem)] ${
              consent ? "text-primary" : "text-muted-foreground/40"
            }`}
          >
            {m.consentContinue}
          </button>

          <div className="mt-[5vh] flex items-center justify-between text-[clamp(0.85rem,1.6vw,1.3rem)] text-muted-foreground">
            <a href="/gdpr" className="underline underline-offset-8">
              Notă de confidențialitate
            </a>
            <button onClick={goAttract}>{m.consentDecline}</button>
          </div>
        </section>
      )}

      {screen === "framing" && (
        <section className="video-stage relative h-full w-full">
          <video
            ref={previewRef}
            muted
            playsInline
            className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
          />
          <div className="video-grade" aria-hidden />
          <div className="kiosk-noise" aria-hidden />
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-[7vw] py-[8vh]">
            <div>
              <p className="text-[clamp(0.8rem,1.5vw,1.3rem)] uppercase tracking-[0.38em] text-primary">{m.framingKicker}</p>
              <h2 className="mt-4 max-w-[9ch] font-display text-[clamp(3.8rem,11vw,10rem)] leading-[0.88] text-foreground">
                {m.framingTitle.replace(/\d+\s+secunde/i, `${settings.framingSeconds} secunde`)}
              </h2>
            </div>
            {countdown !== null && (
              <div className="self-end text-right">
                <p className="font-display text-[clamp(7rem,22vw,20rem)] leading-none text-primary">{String(countdown).padStart(2, "0")}</p>
                <p className="text-[clamp(0.85rem,1.6vw,1.4rem)] uppercase tracking-[0.35em] text-foreground/70">{m.framingCaption}</p>
              </div>
            )}
            {error && <p className="mt-6 text-primary">{error}</p>}
          </div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="video-stage relative h-full w-full bg-background">
          <div className="absolute inset-0 overflow-hidden">
            {delayed && (
              <canvas
                ref={(node) => {
                  mirrorCanvasRef.current = node;
                  delayRef.current?.attach(node);
                }}
                className="absolute inset-0 h-full w-full scale-x-[-1]"
              />
            )}

            {!delayed && <video
              ref={mirrorRef}
              muted
              playsInline
              className="absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-[900ms]"
              style={{
                opacity:
                  mirrorStatus === "live" ||
                  (settings.fallbackMode && mirrorStatus === "publishing")
                    ? 1
                    : 0,
              }}
            />}
            {prevFallbackUrl && (
              <img
                src={prevFallbackUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
              />
            )}
            {fallbackUrl && (
              <img
                key={fallbackUrl}
                src={fallbackUrl}
                alt="Portret transformat"
                className={`${prevFallbackUrl ? "fade-in-quick" : "fade-in-slow"} absolute inset-0 h-full w-full scale-x-[-1] object-cover`}
              />
            )}
            {settings.fallbackMode && mirrorStatus === "publishing" && (
              <p className="absolute bottom-[4%] left-0 w-full text-center text-[clamp(0.9rem,1.8vw,1.5rem)] text-foreground/80">
                {m.mirrorWorking}
              </p>
            )}
            {mirrorStatus !== "live" && !(settings.fallbackMode && mirrorStatus === "publishing") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
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
          <div className="video-grade" aria-hidden />
          <div className="kiosk-noise" aria-hidden />
          <div className="pointer-events-none absolute inset-x-[7vw] top-[7vh] z-10">
            <p className="text-[clamp(0.8rem,1.4vw,1.2rem)] uppercase tracking-[0.38em] text-primary">{m.mirrorKicker}</p>
            <h2 className="mt-4 max-w-[11ch] font-display text-[clamp(3.6rem,10vw,9rem)] leading-[0.9]">{m.mirrorTitle}</h2>
          </div>

          {demo && mirrorStatus === "live" && (
            <span className="absolute right-[4vw] top-[4vh] z-10 border border-hairline px-4 py-2 text-[clamp(0.7rem,1.2vw,1rem)] tracking-[0.3em] text-muted-foreground">
              DEMO
            </span>
          )}
          <p className="absolute bottom-[6vh] left-[7vw] z-10 max-w-[22ch] whitespace-pre-line text-[clamp(1rem,2vw,1.8rem)] leading-relaxed text-foreground/75">{m.mirrorFooter}</p>
        </section>
      )}

      {screen === "choice" && (
        <section className="neon-stage relative flex h-full w-full flex-col items-center justify-center px-[8vw] text-center">
          <div className="kiosk-noise" aria-hidden />
          <NeonButterfly className="absolute left-[8vw] top-[22vh] w-[19vw]" />
          <NeonButterfly className="absolute bottom-[20vh] right-[9vw] w-[15vw]" delay="-3s" reverse />
          <p className="text-[clamp(0.8rem,1.5vw,1.3rem)] uppercase tracking-[0.42em] text-muted-foreground">{m.choiceKicker}</p>
          <h2 className="neon-title mt-[3vh] font-display text-[clamp(4rem,13vw,12rem)] leading-[0.88]">{m.choiceTitle}</h2>
        </section>
      )}

      {screen === "healthy" && (
        <section className="video-stage relative h-full w-full">
          <video ref={healthyRef} muted playsInline className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" />
          <div className="video-grade video-grade-soft" aria-hidden />
          <div className="kiosk-noise" aria-hidden />
          <NeonButterfly className="absolute bottom-[13vh] right-[7vw] w-[14vw]" />
          <div className="absolute left-[7vw] top-[8vh] z-10 max-w-[78vw]">
            <h2 className="font-display text-[clamp(3.2rem,9vw,8rem)] leading-[0.9] text-foreground">{m.healthyTitle}</h2>
          </div>
          <p className="absolute bottom-[8vh] left-[7vw] z-10 max-w-[24ch] whitespace-pre-line text-[clamp(1rem,2.2vw,2rem)] leading-relaxed text-foreground/85">
            {m.healthyBody}
          </p>
        </section>
      )}

      {screen === "capture" && (
        <section className="neon-stage fade-in-slow relative flex h-full flex-col px-[7vw] py-[7vh]">
          <div className="kiosk-noise" aria-hidden />
          <NeonButterfly className="absolute right-[7vw] top-[9vh] w-[24vw]" />
          <div className="relative">
            <p className="text-[clamp(0.8rem,1.4vw,1.2rem)] uppercase tracking-[0.45em] text-primary">{m.finalKicker}</p>
            <h2 className="mt-3 font-display text-[clamp(4rem,12vw,11rem)] leading-[0.82]">{m.finalTitleTop}<br /><span className="text-primary">{m.finalTitleBottom}</span></h2>
            <p className="mt-[4vh] max-w-[22ch] text-[clamp(1.2rem,2.6vw,2.4rem)] leading-snug text-foreground/85">{m.finalSubtitle}</p>
          </div>
          <div className="relative mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[5vw]">
            <div className="min-w-0">
              <p className="mb-[3vh] text-[clamp(0.8rem,1.4vw,1.2rem)] uppercase tracking-[0.28em] text-muted-foreground">{m.finalQrLabel}</p>
              <div className="grid grid-cols-2 gap-x-[4vw] gap-y-[2vh] text-[clamp(0.9rem,1.7vw,1.5rem)]">
                {m.finalOptions
                  .split("\n")
                  .filter(Boolean)
                  .map((option) => (
                    <span key={option}>{option}</span>
                  ))}
              </div>
              <button
                onClick={() => {
                  idleRef.current = Date.now();
                  setPresenceSeconds(20);
                }}
                className="mt-[5vh] border-y border-primary/50 py-[2vh] text-[clamp(1rem,2vw,1.8rem)] text-primary"
              >
                {m.finalPresence}
              </button>
              <p className="mt-3 text-[clamp(0.75rem,1.3vw,1.1rem)] text-muted-foreground">Resetare automată în {presenceSeconds} secunde</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-5">
              <div className="bg-foreground p-3"><QrCode value={origin} size={180} /></div>
              <CancerRibbon className="h-[14vh] w-auto text-primary" />
            </div>
          </div>
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
