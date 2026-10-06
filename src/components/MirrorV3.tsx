import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { AmbientButterflyLoop } from "@/components/AmbientButterflyLoop";
import { QrCode } from "@/components/QrCode";
import { baldifyFrame, FALLBACK_PROMPT, SMILE_PROMPT } from "@/lib/bald";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import { currentSession, startSession, track } from "@/lib/metrics";
import { cameraStyle, viewToFile } from "@/lib/cameraView";
import { syncKiosk } from "@/lib/kiosk-remote";
import { DEFAULT_SETTINGS, loadSettings, type MirrorSettings } from "@/lib/settings";
import verticalFreedomLogo from "@/assets/vf-white.png.asset.json";
import lionsClujLogo from "@/assets/lions-white.png.asset.json";

type Screen = "attract" | "consent" | "framing" | "mirror" | "choice" | "healthy" | "final" | "donate";

const CAMERA_SCREENS: Screen[] = ["attract", "framing", "mirror", "choice", "healthy"];
const PARTICLES = Array.from({ length: 12 }, (_, index) => index);


export function MirrorV3() {
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>("attract");
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_SETTINGS.framingSeconds);
  const [baldUrl, setBaldUrlRaw] = useState("");
  const [prevBaldUrl, setPrevBaldUrl] = useState("");
  const [smileUrl, setSmileUrl] = useState("");
  const [smileFailed, setSmileFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [presenceSeconds, setPresenceSeconds] = useState(DEFAULT_SETTINGS.idleTimeoutSeconds);
  const [cameraOk, setCameraOk] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [aiOk, setAiOk] = useState(false);
  const [aiLatencyMs, setAiLatencyMs] = useState<number | null>(null);
  const [lastAiSuccessAt, setLastAiSuccessAt] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [admin, setAdmin] = useState(false);
  const tapsRef = useRef<number[]>([]);
  const cornerTap = () => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current, now].filter((t) => now - t < 2500);
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      setAdmin(true);
    }
  };
  const [vp, setVp] = useState({ w: 1080, h: 1920 });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef<AbortController | null>(null);
  const generationStartedRef = useRef(false);
  const loopStopRef = useRef(false);
  const idleRef = useRef(Date.now());
  const setBaldUrl = useCallback((url: string) => {
    setBaldUrlRaw((current) => {
      if (current && current !== url) setPrevBaldUrl(current);
      return url;
    });
  }, []);

  const attachCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera nu este disponibilă pe acest dispozitiv");
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(settingsRef.current.cameraDeviceId ? { deviceId: { exact: settingsRef.current.cameraDeviceId } } : { facingMode: "user" }),
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
      }
      const video = videoRef.current;
      if (video && video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
      await video?.play().catch(() => undefined);
      const live = Boolean(streamRef.current?.getVideoTracks().some((track) => track.readyState === "live"));
      setCameraOk(live);
      setCameraUnavailable(!live);
      return streamRef.current;
    } catch (error) {
      setCameraOk(false);
      setCameraUnavailable(true);
      throw error;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOk(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const reset = useCallback(() => {
    generationRef.current?.abort();
    generationRef.current = null;
    generationStartedRef.current = false;
    loopStopRef.current = false;
    stopCamera();
    setConsent(false);
    setBaldUrlRaw("");
    setPrevBaldUrl("");
    setSmileUrl("");
    setSmileFailed(false);
    setGenerationError("");
    setCameraUnavailable(false);
    setProcessing(false);
    setCountdown(settings.framingSeconds);
    setPresenceSeconds(settings.idleTimeoutSeconds);
    setScreen("attract");
  }, [settings.framingSeconds, settings.idleTimeoutSeconds, stopCamera]);

  const startGeneration = useCallback(async () => {
    if (generationStartedRef.current) return;
    generationStartedRef.current = true;
    loopStopRef.current = false;
    setProcessing(true);
    setGenerationError("");
    const controller = new AbortController();
    generationRef.current = controller;
    try {
      const startedAt = Date.now();
      await attachCamera();
      const video = videoRef.current;
      if (!video) throw new Error("Camera nu este pregătită");
      const deadline = Date.now() + 3500;
      while (!video.videoWidth && Date.now() < deadline && !controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      // Give visitors a moment to step back into the final framing after consent.
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, 1500);
        controller.signal.addEventListener("abort", () => {
          window.clearTimeout(id);
          resolve();
        }, { once: true });
      });
      if (controller.signal.aborted) return;

      const baldFrame = viewToFile(video, settingsRef.current, window.innerWidth, window.innerHeight, 768);
      if (!baldFrame) throw new Error("Nu am putut prelua imaginea camerei");
      // Run both portraits in parallel from the same frame so the smile is
      // ready by the time the bald one has been shown.
      const smileJob = (async () => {
        // The smile portrait is a bonus: if the AI refuses it, keep the live
        // camera on the choice screen instead of surfacing an error.
        try {
          await baldifyFrame(
            baldFrame,
            SMILE_PROMPT,
            (url, isFinal) => {
              if (!controller.signal.aborted && isFinal) setSmileUrl(url);
            },
            controller.signal,
            settings.fallbackModel,
            false,
          );
        } catch (smileError) {
          if (controller.signal.aborted) return;
          console.warn("[smile]", smileError instanceof Error ? smileError.message : smileError);
          setSmileFailed(true);
        }
      })();
      await baldifyFrame(
        baldFrame,
        FALLBACK_PROMPT,
        (url, isFinal) => {
          if (controller.signal.aborted) return;
          setBaldUrl(url);
          if (isFinal) {
            setProcessing(false);
            setAiOk(true);
            setAiLatencyMs(Date.now() - startedAt);
            setLastAiSuccessAt(new Date().toISOString());
          }
        },
        controller.signal,
        settings.fallbackModel,
        true,
      );
      await smileJob;
    } catch (error) {
      if (controller.signal.aborted) return;
      setProcessing(false);
      setAiOk(false);
      setGenerationError(error instanceof Error ? error.message : "Transformarea nu este disponibilă");
    }
  }, [attachCamera, settings.fallbackModel]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const loaded = loadSettings();
    setSettings(loaded);
    setCountdown(loaded.framingSeconds);
    const uninstall = installKioskHardening();
    return () => {
      uninstall();
      generationRef.current?.abort();
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    let active = true;
    const report = async () => {
      if (!active) return;
      try {
        const probe = await fetch("/api/bald", { method: "GET", cache: "no-store" });
        const routeOk = probe.ok && Boolean(((await probe.json().catch(() => ({}))) as { ok?: boolean }).ok);
        setAiOk((current) => current || routeOk);
      } catch {
        setAiOk(false);
      }
      try {
        await syncKiosk({
          kioskName: settingsRef.current.kioskName,
          currentScreen: screen,
          cameraOk,
          aiOk,
          aiLatencyMs,
          lastAiSuccessAt,
          lastError: generationError || null,
          sessionActive: screen !== "attract",
        });
      } catch {
        // Monitoring is best-effort and must never interrupt the kiosk flow.
      }
    };
    void report();
    const id = window.setInterval(() => void report(), 10_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [screen, cameraOk, aiOk, aiLatencyMs, lastAiSuccessAt, generationError]);

  useEffect(() => {
    if (!CAMERA_SCREENS.includes(screen)) return;
    void attachCamera().catch(() => {
      if (screen !== "attract") setGenerationError("Camera nu este disponibilă. Verifică permisiunea și conexiunea camerei.");
    });
  }, [screen, attachCamera]);

  useEffect(() => {
    if (screen !== "framing") return;
    setCountdown(settings.framingSeconds);
    void startGeneration();
    const id = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          window.setTimeout(() => setScreen("mirror"), 0);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, settings.framingSeconds, startGeneration]);

  const hasBald = Boolean(baldUrl);

  useEffect(() => {
    if (screen !== "mirror" || !hasBald) return;
    const id = window.setTimeout(() => setScreen("choice"), settings.mirrorSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [screen, hasBald, settings.mirrorSeconds]);

  useEffect(() => {
    if (screen !== "framing" && screen !== "mirror") loopStopRef.current = true;
  }, [screen]);

  useEffect(() => {
    if (screen !== "mirror" || baldUrl) return;
    const waitMs = generationError ? 7000 : 45000;
    const id = window.setTimeout(() => {
      generationRef.current?.abort();
      setScreen("choice");
    }, waitMs);
    return () => window.clearTimeout(id);
  }, [screen, baldUrl, generationError]);

  useEffect(() => {
    if (screen === "choice" && smileUrl) {
      const id = window.setTimeout(() => setScreen("healthy"), settings.captureSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    if (screen === "healthy") {
      const id = window.setTimeout(() => setScreen("final"), settings.thanksSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, settings.captureSeconds, settings.thanksSeconds, smileUrl]);

  useEffect(() => {
    if (screen !== "choice" || smileUrl) return;
    const wait = smileFailed ? settings.captureSeconds * 1000 : 45_000;
    const id = window.setTimeout(() => setScreen("healthy"), wait);
    return () => window.clearTimeout(id);
  }, [screen, smileUrl, smileFailed, settings.captureSeconds]);

  useEffect(() => {
    if (screen !== "consent") return;
    const id = window.setTimeout(reset, 20_000);
    return () => window.clearTimeout(id);
  }, [screen, reset]);

  useEffect(() => {
    if (screen !== "final" && screen !== "donate") return;
    setPresenceSeconds(settings.idleTimeoutSeconds);
    const id = window.setInterval(() => {
      setPresenceSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(id);
          window.setTimeout(reset, 0);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [screen, reset, settings.idleTimeoutSeconds]);

  useEffect(() => {
    if (screen === "attract" || screen === "donate") return;
    const kiosk = settings.kioskName;
    const event = {
      consent: "consent",
      framing: "framing",
      mirror: "mirror",
      choice: "choice",
      healthy: "prevention",
      final: "final",
    }[screen] as "consent" | "framing" | "mirror" | "choice" | "prevention" | "final";
    track(event, { kiosk, meta: { version: "v3" } });
  }, [screen, settings.kioskName]);

  useEffect(() => {
    // Each screen starts with a fresh inactivity window. The consent screen must
    // remain available while the visitor reads it, regardless of time spent on attract.
    idleRef.current = Date.now();
    if (screen === "attract" || screen === "consent") return;
    const activity = () => { idleRef.current = Date.now(); };
    const id = window.setInterval(() => {
      if (Date.now() - idleRef.current > 45_000 && screen !== "mirror") reset();
    }, 1000);
    window.addEventListener("pointerdown", activity, { passive: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pointerdown", activity);
    };
  }, [screen, reset]);

  const messages = Object.fromEntries(
    Object.entries(settings.messages).map(([key, value]) => [key, typeof value === "string" ? value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .split("\n")
      .map((line) => line.replace(/\s+(\S+)$/, "\u00a0$1"))
      .join("\n") : value]),
  ) as MirrorSettings["messages"];
  const cameraVisible = CAMERA_SCREENS.includes(screen);
  const donationQr = "https://verticalfreedom.org/te-vezi-oglinda/";

  const cameraError = cameraUnavailable && !baldUrl;
  const retry = async () => {
    generationRef.current?.abort();
    generationRef.current = null;
    generationStartedRef.current = false;
    stopCamera();
    setGenerationError("");
    setCameraUnavailable(false);
    try {
      await attachCamera();
      setScreen("framing");
    } catch {
      setGenerationError("Camera nu este disponibilă. Verifică permisiunea și conexiunea camerei.");
      setCameraUnavailable(true);
    }
  };

  return (
    <main className="v3-shell relative h-dvh w-screen overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        style={cameraStyle(settings, vp.w, vp.h)}
        className={`transition-opacity duration-1000 ${cameraVisible ? "opacity-100" : "opacity-0"}`}
      />
      {cameraVisible && <div className={`v3-tint ${screen === "mirror" && !baldUrl ? "v3-tint-strong" : ""}`} aria-hidden />}
      {(screen === "final" || screen === "donate") && <div className="v3-tint v3-tint-strong" aria-hidden />}

      {prevBaldUrl && screen === "mirror" && (
        <img src={prevBaldUrl} alt="" aria-hidden className="v2-generated-portrait absolute inset-0 z-[3] h-full w-full" />
      )}
      {baldUrl && screen === "mirror" && (
        <img key={baldUrl} src={baldUrl} alt="Portret procesat artistic" className="v2-generated-portrait v2-bald-in absolute inset-0 z-[3] h-full w-full" />
      )}
      {smileUrl && screen === "choice" && (
        <img src={smileUrl} alt="Portret procesat zâmbind" className="v2-generated-portrait v2-smile-in absolute inset-0 z-[4] h-full w-full" />
      )}
      {cameraVisible && <div className="v3-top-gradient" aria-hidden />}
      <AmbientButterflyLoop visible={screen === "attract"} />

      {screen === "attract" && (
        <section
          className="v3-screen v3-attract"
          onClick={() => {
            void enterFullscreen();
            void attachCamera().catch(() => undefined);
            startSession();
            track("start", { kiosk: settings.kioskName, meta: { version: "v3" } });
            setScreen("consent");
          }}
        >
          <BrandHeader />
          <div className="v3-attract-copy v3-enter grid gap-[1.6vw] text-center">
            <div className="v3-campaign-banner">
              <p className="v3-label">Fundația Vertical Freedom prezintă</p>
              <p className="v3-body">Campania de prevenție și conștientizare.</p>
            </div>
            <h1 className="v3-headline v3-headline-xl">TE VEZI?</h1>
            <p className="v3-body-lg">Privește-te.{"\n"}Doar {settings.framingSeconds} secunde.</p>
          </div>
          <PrimaryAction className="v3-attract-action" title="Atinge ecranul pentru a începe" />
          <div className="v3-qr-card v3-attract-qr" onClick={(e) => e.stopPropagation()}>
            <div className="v3-qr-box"><QrCode value={donationQr} size={360} /></div>
            <div className="grid gap-[0.8vw]">
              <p className="v3-card-title">Scanează QR-ul</p>
              <p className="v3-body-sm">Află despre campanie înainte de a începe.</p>
            </div>
          </div>
        </section>
      )}

      {screen === "consent" && (
        <section className="v3-screen v3-consent">
          <div className="v3-enter grid gap-[2.4vw]">
            <h2 className="v3-headline v3-headline-md">ÎNAINTE DE A ÎNCEPE</h2>
            <p className="v3-body">{messages.consentBody}</p>
          </div>
          <button type="button" onClick={() => setConsent((v) => !v)} className="v3-check mt-[3vw]" aria-pressed={consent}>
            <span className={`v3-check-box ${consent ? "is-on" : ""}`}>{consent ? "✓" : ""}</span>
            <span>Am citit și sunt de acord.</span>
          </button>
          <a href="/gdpr" className="v3-link mt-[1.6vw]">Notă de confidențialitate</a>
          <div className="mt-[3vw] grid grid-cols-2 gap-[2vw]">
            <SecondaryAction title="Renunț" subtitle="Ieși din experiență" onClick={reset} />
            <PrimaryAction title="Continuă" subtitle="Confirmă și începe" disabled={!consent} onClick={() => { void startGeneration(); setScreen("framing"); }} />
          </div>
        </section>
      )}

      {screen === "framing" && (
        <section className="v3-screen">
          <div className="v3-enter grid grid-cols-[1fr_auto] items-start gap-[3vw] pt-[2vw]">
            <div className="grid gap-[1.4vw]">
              <p className="v3-label">TE VEZI?</p>
              <h2 className="v3-headline v3-headline-lg">PRIVEȘTE-TE{"\n"}{settings.framingSeconds} SECUNDE.</h2>
            </div>
            <div className="grid justify-items-end gap-[1vw]">
              <ProgressRing value={countdown / Math.max(1, settings.framingSeconds)}>
                <span key={countdown} className="v3-count">{String(countdown).padStart(2, "0")}</span>
              </ProgressRing>
              <p className="v3-label v3-muted text-right">Un moment doar al tău</p>
            </div>
          </div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="v3-screen">
          <div className="v3-enter grid gap-[1.4vw] pt-[2vw]">
            <p className="v3-label">O posibilă schimbare</p>
            <h2 className="v3-headline v3-headline-lg">DACĂ MÂINE{"\n"}TOTUL{"\n"}S-AR SCHIMBA?</h2>
          </div>
          {!baldUrl && !cameraError && (
            <GlassPanel className="mt-[4vw] flex items-center gap-[3vw]">
              <Spinner />
              <p className="v3-card-title">{generationError ? "Imaginea reală rămâne cu tine." : "Se procesează imaginea"}</p>
            </GlassPanel>
          )}
          {cameraError && (
            <ErrorPanel onRetry={() => void retry()} onExit={reset} />
          )}
          {baldUrl && (
            <GlassPanel className="mt-[4vw] grid gap-[1.2vw]">
              <p className="v3-card-title">O imagine artistică generată de inteligență artificială</p>
              <p className="v3-body-sm v3-muted">Această compoziție nu este o previziune, ci o interpretare artistică a unui portret procesat, realizată pentru o experiență verticală de doi metri.</p>
            </GlassPanel>
          )}
        </section>
      )}

      {screen === "choice" && (
        <section className="v3-screen">
          <div className="v3-enter grid gap-[1.4vw] pt-[2vw]">
            <p className="v3-label">Realitatea poate fi imprevizibilă</p>
            <h2 className="v3-headline v3-headline-xl">ÎNCĂ POȚI{"\n"}ALEGE!</h2>
          </div>
        </section>
      )}

      {screen === "healthy" && (
        <section className="v3-screen">
          <h2 className="v3-enter v3-headline v3-headline-md pt-[2vw]">PREVENȚIA ÎNCEPE{"\n"}ÎNAINTE SĂ DOARĂ.</h2>
          <GlassPanel className="v3-enter mt-[3vw] grid gap-[2vw]">
            <div className="grid gap-[0.8vw]">
              <p className="v3-label">Pașii de urmat</p>
              <p className="v3-body">Fă-ți controalele regulate, ascultă-ți corpul și acționează la timp.</p>
            </div>
            {STEPS.map(([title, body], i) => (
              <div key={title} className="v3-step">
                <span className="v3-step-num">{i + 1}</span>
                <div className="grid gap-[0.5vw]">
                  <p className="v3-card-title">{title}</p>
                  <p className="v3-body-sm v3-muted">{body}</p>
                </div>
              </div>
            ))}
          </GlassPanel>
        </section>
      )}

      {screen === "final" && (
        <section className="v3-screen">
          <BrandHeader />
          <div className="v3-enter mt-[5vw] grid gap-[2vw]">
            <h2 className="v3-headline v3-headline-md">PREVENȚIA ÎNCEPE{"\n"}ÎNAINTE SĂ DOARĂ.</h2>
            <p className="v3-body">Scanează codul QR, alege drumul tău și contribuie la un răspuns mai rapid, mai sigur și mai aproape pentru sănătatea mintală.</p>
          </div>
          <div className="v3-dark-card v3-enter mt-[3vw]">
            <div className="v3-qr-box"><QrCode value={donationQr} size={480} /></div>
            <div className="grid content-start gap-[1.2vw]">
              <p className="v3-headline v3-headline-sm">DONEAZĂ ACUM</p>
              <p className="v3-body-sm">Scanează codul pentru a alege suma și drumul tău.</p>
              <PrimaryAction className="mt-[1vw]" title="Donează" onClick={() => setScreen("donate")} />
              <ResetTimer seconds={presenceSeconds} onStay={() => { idleRef.current = Date.now(); setPresenceSeconds(settings.idleTimeoutSeconds); }} />
            </div>
          </div>
        </section>
      )}

      {screen === "donate" && (
        <section className="v3-screen items-center text-center">
          <BrandHeader />
          <div className="v3-enter mt-[5vw] grid justify-items-center gap-[1.6vw]">
            <h2 className="v3-headline v3-headline-lg">DONEAZĂ{"\n"}ACUM.</h2>
            <p className="v3-body">Susține prevenția cancerului prin intermediul Lions Club.{"\n"}Scanează codul QR pentru a dona rapid și în siguranță.</p>
          </div>
          <div className="v3-enter mt-[3vw] grid w-full grid-cols-[auto_1fr] items-stretch gap-[2.4vw] text-left">
            <div className="v3-qr-box v3-qr-xl"><QrCode value={donationQr} size={640} /></div>
            <GlassPanel className="grid content-start gap-[1.2vw]">
              <p className="v3-headline v3-headline-xs">SUSȚINE{"\n"}PREVENȚIA{"\n"}CANCERULUI</p>
              <p className="v3-body-sm v3-muted">Donația este opțională și se face în siguranță, pe telefonul tău.</p>
              <ol className="grid gap-[0.8vw]">
                {["Deschide aplicația de scanare", "Completează plata în siguranță", "Primești confirmarea donației"].map((t, i) => (
                  <li key={t} className="v3-step"><span className="v3-step-num v3-step-num-sm">{i + 1}</span><span className="v3-body-sm">{t}</span></li>
                ))}
              </ol>
            </GlassPanel>
          </div>
          <div className="mt-[3vw] flex w-full items-center justify-between gap-[2vw]">
            <SecondaryAction title="Înapoi" onClick={() => setScreen("final")} />
            <ResetTimer seconds={presenceSeconds} />
          </div>
        </section>
      )}

      <button
        type="button"
        aria-label="Administrare"
        className="absolute left-0 top-0 z-[60] h-24 w-24 opacity-0"
        onClick={(e) => { e.stopPropagation(); cornerTap(); }}
      />
      {admin && (
        <div className="fixed inset-0 z-[70]">
          <AdminPanel settings={settings} onChange={setSettings} onClose={() => setAdmin(false)} />
        </div>
      )}
    </main>
  );
}

const STEPS: [string, string][] = [
  ["Programează-ți controalele regulate.", "Stabilește o rutină clară și urmează-o constant pentru a depista orice semn devreme."],
  ["Ascultă-ți corpul și notează schimbările.", "Dacă observi dureri persistente, modificări ale pielii sau simptome neobișnuite, vorbește cu medicul."],
  ["Acționează la timp și păstrează liniștea.", "Nu amâna vizita medicală. Cu cât intervenim mai devreme, cu atât mai bun este prognosticul."],
];

function BrandHeader() {
  return (
    <header className="v3-brand pointer-events-none">
      <img src={verticalFreedomLogo.url} alt="Vertical Freedom" className="v3-logo-vf" />
      <img src={lionsClujLogo.url} alt="Lions Club" className="v3-logo-lions" />
    </header>
  );
}

function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`v3-glass ${className}`}>{children}</div>;
}

function PrimaryAction({ title, subtitle, onClick, disabled, className = "" }: { title: string; subtitle?: string; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`v3-btn v3-btn-primary ${className}`}>
      <span className="v3-btn-title">{title}</span>
      {subtitle && <span className="v3-btn-sub">{subtitle}</span>}
    </button>
  );
}

function SecondaryAction({ title, subtitle, onClick, className = "" }: { title: string; subtitle?: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`v3-btn v3-btn-secondary ${className}`}>
      <span className="v3-btn-title">{title}</span>
      {subtitle && <span className="v3-btn-sub">{subtitle}</span>}
    </button>
  );
}

function ProgressRing({ value, children }: { value: number; children: ReactNode }) {
  const c = 2 * Math.PI * 46;
  return (
    <div className="v3-ring">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="46" className="v3-ring-track" />
        <circle cx="50" cy="50" r="46" className="v3-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <div className="v3-ring-label">{children}</div>
    </div>
  );
}

function Spinner() {
  return <span className="v3-spinner" role="status" aria-label="Se procesează" />;
}

function ResetTimer({ seconds, onStay }: { seconds: number; onStay?: () => void }) {
  return (
    <button type="button" onClick={onStay} className="v3-timer">
      <span className="v3-timer-dot" />
      <span>Sesiunea se resetează în {seconds}s{onStay ? " · Sunt aici" : ""}</span>
    </button>
  );
}

function ErrorPanel({ onRetry, onExit }: { onRetry: () => void; onExit: () => void }) {
  return (
    <GlassPanel className="mt-[4vw] grid gap-[2vw]">
      <div className="grid gap-[0.8vw]">
        <p className="v3-card-title">CAMERA INDISPONIBILĂ</p>
        <p className="v3-body-sm v3-muted">Nu putem continua analiza în acest moment. Atinge ecranul pentru a reîncerca.</p>
      </div>
      <div className="grid grid-cols-2 gap-[2vw]">
        <PrimaryAction title="REÎNCEARCĂ" subtitle="Verifică conexiunea camerei și pornește din nou." onClick={onRetry} />
        <SecondaryAction title="IEȘI ÎN SIGURANȚĂ" subtitle="Închide sesiunea și revino când ești pregătit." onClick={onExit} />
      </div>
    </GlassPanel>
  );
}
