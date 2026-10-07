import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { KioskAudio } from "@/components/KioskAudio";
import { CampaignLines, NeonButterfly, PreventionIcon } from "@/components/v4-decor";
import sunriseAsset from "@/assets/v4-sunrise.png.asset.json";
import { QrCode } from "@/components/QrCode";
import { baldifyFrame, FALLBACK_PROMPT, SMILE_PROMPT } from "@/lib/bald";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import { currentSession, startSession, track } from "@/lib/metrics";
import { cameraStyle, viewToFile } from "@/lib/cameraView";
import { syncKiosk } from "@/lib/kiosk-remote";
import { DEFAULT_SETTINGS, loadSettings, type MirrorSettings } from "@/lib/settings";

type Screen = "attract" | "consent" | "framing" | "mirror" | "choice" | "healthy" | "final" | "donate";

const CAMERA_SCREENS: Screen[] = ["attract", "framing", "mirror", "choice"];


export function MirrorV4() {
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>("attract");
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_SETTINGS.framingSeconds);
  const [baldUrl, setBaldUrlRaw] = useState("");
  const [prevBaldUrl, setPrevBaldUrl] = useState("");
  const [smileUrl, setSmileUrl] = useState("");
  const [smileFailed, setSmileFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadedBaldUrl, setLoadedBaldUrl] = useState("");
  const [loadedSmileUrl, setLoadedSmileUrl] = useState("");
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
    setLoadedBaldUrl("");
    setLoadedSmileUrl("");
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

  const baldReady = Boolean(baldUrl) && !processing && loadedBaldUrl === baldUrl;
  const smileReady = Boolean(smileUrl) && loadedSmileUrl === smileUrl;

  useEffect(() => {
    // Partial previews and processing time never consume the portrait's viewing time.
    if (screen !== "mirror" || !baldReady) return;
    const id = window.setTimeout(() => setScreen("choice"), settings.mirrorSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [screen, baldReady, settings.mirrorSeconds]);

  useEffect(() => {
    if (screen !== "framing" && screen !== "mirror") loopStopRef.current = true;
  }, [screen]);

  useEffect(() => {
    if (screen !== "mirror" || baldReady) return;
    const waitMs = generationError ? 7000 : 45000;
    const id = window.setTimeout(() => {
      generationRef.current?.abort();
      setScreen("choice");
    }, waitMs);
    return () => window.clearTimeout(id);
  }, [screen, baldReady, generationError]);

  useEffect(() => {
    if (screen === "choice" && (smileReady || smileFailed)) {
      const id = window.setTimeout(() => setScreen("final"), (settings.captureSeconds + settings.thanksSeconds) * 1000);
      return () => window.clearTimeout(id);
    }
    if (screen === "healthy") {
      const id = window.setTimeout(() => setScreen("final"), settings.thanksSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, smileReady, smileFailed, settings.captureSeconds, settings.thanksSeconds]);

  useEffect(() => {
    if (screen !== "choice" || smileReady || smileFailed) return;
    // A failed or stalled bonus portrait must still leave a usable camera fallback.
    const id = window.setTimeout(() => setSmileFailed(true), 45_000);
    return () => window.clearTimeout(id);
  }, [screen, smileReady, smileFailed]);


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
    track(event, { kiosk, meta: { version: "v4" } });
  }, [screen, settings.kioskName]);

  useEffect(() => {
    // Each screen starts with a fresh inactivity window. The consent screen must
    // remain available while the visitor reads it, regardless of time spent on attract.
    idleRef.current = Date.now();
    if (screen === "attract" || screen === "consent") return;
    const activity = () => { idleRef.current = Date.now(); };
    const id = window.setInterval(() => {
      if (Date.now() - idleRef.current > 45_000 && screen !== "mirror" && screen !== "choice") reset();
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

  const total = Math.max(1, settings.framingSeconds);
  const countNumbers = Array.from({ length: total }, (_, i) => total - i);

  return (
    <main className={`v4-shell ${cameraVisible ? "is-dark" : "is-light"}`}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={cameraStyle(settings, vp.w, vp.h)}
        className={`transition-opacity duration-1000 ${cameraVisible ? "opacity-100" : "opacity-0"}`}
      />
      {cameraVisible && <div className={`v4-veil v4-veil-${screen}`} aria-hidden />}

      {prevBaldUrl && screen === "mirror" && (
        <img src={prevBaldUrl} alt="" aria-hidden className="v2-generated-portrait absolute inset-0 z-[3] h-full w-full" />
      )}
      {baldUrl && screen === "mirror" && (
        <img key={baldUrl} src={baldUrl} onLoad={() => setLoadedBaldUrl(baldUrl)} alt="Portret procesat artistic" className="v2-generated-portrait v2-bald-in absolute inset-0 z-[3] h-full w-full" />
      )}
      {smileUrl && screen === "choice" && (
        <img src={smileUrl} onLoad={() => setLoadedSmileUrl(smileUrl)} onError={() => setSmileFailed(true)} alt="Portret procesat zâmbind" className="v2-generated-portrait v2-smile-in absolute inset-0 z-[4] h-full w-full" />
      )}
      {cameraVisible && <div className="v4-bottom-shade" aria-hidden />}

      {screen === "attract" && (
        <section
          className="v4-screen v4-attract"
          onClick={() => {
            void enterFullscreen();
            void attachCamera().catch(() => undefined);
            startSession();
            track("start", { kiosk: settings.kioskName, meta: { version: "v4" } });
            setScreen("consent");
          }}
        >
          <CampaignLines variant="attract" />
          <NeonButterfly className="v4-butterfly-top" />
          <div className="v4-enter v4-attract-credit">
            <p className="v4-org">FUNDAȚIA{"\n"}VERTICAL FREEDOM</p>
            <p className="v4-presents">prezintă</p>
            <p className="v4-campaign">Campania de prevenție{"\n"}și conștientizare</p>
          </div>
          <h1 className="v4-enter v4-display v4-te-vezi">TE VEZI?</h1>
          <PillButton label="ÎNCEPE AICI" className="v4-attract-pill" />
          <div className="v4-qr-block" onClick={(e) => e.stopPropagation()}>
            <div className="v4-qr-card"><div className="v4-qr-backing"><QrCode value={donationQr} size={480} /></div></div>
            <p className="v4-qr-caption">Scanează-mă{"\n"}pentru mai multe{"\n"}informații.</p>
          </div>
        </section>
      )}

      {screen === "consent" && (
        <section className="v4-screen v4-light v4-consent">
          <CampaignLines variant="light" />
          <NeonButterfly className="v4-butterfly-small" />
          <h2 className="v4-enter v4-serif-title">TERMENI SI CONDITII</h2>
          <span className="v4-divider" aria-hidden />
          <div className="v4-enter v4-terms">
            <p>Această experiență interactivă{"\n"}face parte din campania de prevenție{"\n"}și conștientizare „TE VEZI?”,{"\n"}organizată de Fundația Vertical Freedom.</p>
            <p>Experiența are scop informativ și educativ.{"\n"}Imaginea afișată poate fi modificată{"\n"}digital pentru a crea un moment{"\n"}de conștientizare și nu reprezintă{"\n"}un diagnostic sau o predicție medicală.</p>
            <p>Prin continuare, confirmi că ai înțeles{"\n"}scopul experienței și ești de acord{"\n"}să participi.</p>
          </div>
          <PillButton label="ACCEPTĂ" className="v4-consent-pill" onClick={() => { setConsent(true); void startGeneration(); setScreen("framing"); }} />
          <button type="button" className="v4-text-link" onClick={reset}>Renunț</button>
        </section>
      )}

      {screen === "framing" && (
        <section className="v4-screen v4-countdown">
          <CampaignLines variant="countdown" />
          <ol className="v4-count-column" aria-label={`Mai sunt ${countdown} secunde`}>
            {countNumbers.map((n) => (
              <li key={n} className={`v4-count-ring ${countdown <= n ? "is-shown" : ""} ${countdown === n ? "is-now" : ""}`}>
                <span>{n}</span>
              </li>
            ))}
          </ol>
          <div className="v4-count-copy v4-enter">
            <p>O posibilă versiune{"\n"}vulnerabilă a ta.</p>
            <p className="v4-accent">Viața este imprevizibilă.</p>
          </div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="v4-screen v4-transform">
          {!baldUrl && !cameraError && (
            <div className="v4-processing" role="status">
              <span className="v4-processing-ring" aria-hidden />
              <p>{generationError ? "Imaginea reală rămâne cu tine." : "Se procesează imaginea"}</p>
            </div>
          )}
          {cameraError && (
            <div className="v4-processing">
              <p>Camera nu este disponibilă.</p>
              <div className="flex gap-[3vw]">
                <PillButton label="REÎNCEARCĂ" onClick={() => void retry()} />
                <button type="button" className="v4-text-link is-dark" onClick={reset}>Ieși</button>
              </div>
            </div>
          )}
          <div className="v4-enter v4-reflect">
            <p>Dacă mâine{"\n"}totul s-ar schimba,</p>
            <p className="v4-accent">ce ai fi vrut să nu amâni?</p>
          </div>
        </section>
      )}

      {screen === "choice" && (
        <section className="v4-screen v4-back">
          <CampaignLines variant="lower" />
          <div className="v4-enter v4-back-title">
            <p>Acum,</p>
            <p className="v4-accent">ce faci pentru tine?</p>
          </div>
          <ul className="v4-actions">
            {ACTIONS.map(([icon, label], i) => (
              <li key={label} style={{ animationDelay: `${300 + i * 160}ms` }}>
                <PreventionIcon name={icon} />
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <PillButton label={"NU AMÂNA GRIJA\nPENTRU TINE."} className="v4-back-pill" chevron={false} onClick={() => setScreen("final")} />
        </section>
      )}

      {screen === "final" && (
        <section className="v4-screen v4-light v4-final">
          <img src={sunriseAsset.url} alt="" aria-hidden className="v4-sunrise" />
          <div className="v4-final-wash" aria-hidden />
          <CampaignLines variant="light" />
          <h2 className="v4-enter v4-serif-title v4-final-title">TRĂIEȘTE-ȚI{"\n"}VIAȚA ACUM.</h2>
          <p className="v4-enter v4-final-sub">Prevenția începe{"\n"}înainte să doară.</p>
          <div className="v4-final-qr">
            <div className="v4-qr-card is-glow"><div className="v4-qr-backing"><QrCode value={donationQr} size={640} /></div></div>
            <p className="v4-qr-caption is-ink">Scanează și află{"\n"}ce poți face pentru tine.</p>
          </div>
          <span className="v4-divider is-wide" aria-hidden />
          <div className="v4-cause">
            <p className="v4-cause-lead">Prin campania „TE VEZI?”{"\n"}strângem</p>
            <button
              type="button"
              className="v4-amount"
              onClick={() => {
                track("donate_click", { kiosk: settings.kioskName, meta: { version: "v4", source: "final_button" } });
                setScreen("donate");
              }}
            >50.000 €</button>
            <p className="v4-cause-body"><strong>pentru Fondul pentru Prevenție{"\n"}și Sănătate Mintală,</strong>{"\n"}prin care ne propunem să oferim acces{"\n"}la screening și psihoterapie{"\n"}pentru până la 1.000 de persoane.</p>
          </div>
          <footer className="v4-final-footer">
            <NeonButterfly className="v4-butterfly-footer" />
            <p className="v4-org is-ink">FUNDAȚIA{"\n"}VERTICAL FREEDOM</p>
            <p className="v4-accent v4-motto">Împreună pentru viață</p>
          </footer>
          <p className="v4-reset">Revenire în {presenceSeconds}s</p>
        </section>
      )}

      {screen === "donate" && (
        <section className="v4-screen v4-light v4-donate">
          <CampaignLines variant="light" />
          <NeonButterfly className="v4-butterfly-small" />
          <h2 className="v4-enter v4-serif-title">DONEAZĂ ACUM.</h2>
          <p className="v4-final-sub">Scanează codul și alege suma{"\n"}direct pe telefonul tău.</p>
          <div className="v4-qr-card is-glow v4-donate-qr"><div className="v4-qr-backing"><QrCode value={donationQr} size={900} /></div></div>
          <div className="flex items-center gap-[4vw]">
            <button type="button" className="v4-text-link" onClick={() => setScreen("final")}>← Înapoi</button>
            <p className="v4-reset is-inline">Revenire în {presenceSeconds}s</p>
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

const ACTIONS: ["heart" | "lotus" | "search" | "shield", string][] = [
  ["heart", "Fă-ți controalele."],
  ["lotus", "Ascultă-ți corpul."],
  ["search", "Nu ignora semnele."],
  ["shield", "Alege prevenția."],
];

function PillButton({ label, onClick, className = "", chevron = true }: { label: string; onClick?: () => void; className?: string; chevron?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`v4-pill ${className}`}>
      <span>{label}</span>
      {chevron && (
        <svg viewBox="0 0 24 24" aria-hidden className="v4-pill-chevron"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
    </button>
  );
}
