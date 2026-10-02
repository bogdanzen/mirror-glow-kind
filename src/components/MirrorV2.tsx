import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/AdminPanel";
import { QrCode } from "@/components/QrCode";
import { baldifyFrame, FALLBACK_PROMPT, SMILE_PROMPT } from "@/lib/bald";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import { currentSession, startSession, track } from "@/lib/metrics";
import { cameraStyle, viewToFile } from "@/lib/cameraView";
import { DEFAULT_SETTINGS, loadSettings, type MirrorSettings } from "@/lib/settings";
import verticalFreedomLogo from "@/assets/vf-white.png.asset.json";
import lionsClujLogo from "@/assets/lions-white.png.asset.json";

type Screen = "attract" | "consent" | "framing" | "mirror" | "choice" | "healthy" | "final" | "donate";

const CAMERA_SCREENS: Screen[] = ["attract", "framing", "mirror", "choice", "healthy"];
const PARTICLES = Array.from({ length: 12 }, (_, index) => index);

function Logos() {
  return (
    <div className="v2-logos pointer-events-none absolute inset-x-[6vw] top-[3.5vh] z-30 flex items-start justify-between">
      <img src={verticalFreedomLogo.url} alt="Vertical Freedom" className="h-auto w-[clamp(7rem,20vw,17rem)] object-contain v2-logo-white" />
      <img src={lionsClujLogo.url} alt="Lions Club Vertical Freedom" className="h-auto w-[clamp(5.5rem,14vw,11rem)] object-contain v2-logo-white" />
    </div>
  );
}

function RoseFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`v2-rose-frame v2-text-shade ${className}`}><div className="v2-rose-frame-core">{children}</div></div>;
}

function PinkParticles() {
  return (
    <div className="v2-particles pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {PARTICLES.map((particle) => <span key={particle} />)}
    </div>
  );
}

export function MirrorV2() {
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>("attract");
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_SETTINGS.framingSeconds);
  const [baldUrl, setBaldUrlRaw] = useState("");
  const [prevBaldUrl, setPrevBaldUrl] = useState("");
  const [smileUrl, setSmileUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [presenceSeconds, setPresenceSeconds] = useState(20);
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
    return streamRef.current;
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
    setGenerationError("");
    setProcessing(false);
    setCountdown(settings.framingSeconds);
    setPresenceSeconds(20);
    setScreen("attract");
  }, [settings.framingSeconds, stopCamera]);

  const startGeneration = useCallback(async () => {
    if (generationStartedRef.current) return;
    generationStartedRef.current = true;
    loopStopRef.current = false;
    setProcessing(true);
    setGenerationError("");
    const controller = new AbortController();
    generationRef.current = controller;
    try {
      await attachCamera();
      const video = videoRef.current;
      if (!video) throw new Error("Camera nu este pregătită");
      const deadline = Date.now() + 3500;
      while (!video.videoWidth && Date.now() < deadline && !controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      // Give visitors time to step back into the final framing after consent.
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, 3000);
        controller.signal.addEventListener("abort", () => {
          window.clearTimeout(id);
          resolve();
        }, { once: true });
      });
      if (controller.signal.aborted) return;

      const baldFrame = viewToFile(video, settingsRef.current, window.innerWidth, window.innerHeight, 1024);
      if (!baldFrame) throw new Error("Nu am putut prelua imaginea camerei");
      await baldifyFrame(
        baldFrame,
        FALLBACK_PROMPT,
        (url, isFinal) => {
          if (controller.signal.aborted) return;
          setBaldUrl(url);
          if (isFinal) setProcessing(false);
        },
        controller.signal,
        settings.fallbackModel,
        true,
      );

      if (controller.signal.aborted || loopStopRef.current) return;
      const smileFrame = viewToFile(video, settingsRef.current, window.innerWidth, window.innerHeight, 1024);
      if (!smileFrame) return;
      await baldifyFrame(
        smileFrame,
        SMILE_PROMPT,
        (url, isFinal) => {
          if (!controller.signal.aborted && isFinal) setSmileUrl(url);
        },
        controller.signal,
        settings.fallbackModel,
        false,
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setProcessing(false);
      setGenerationError(error instanceof Error ? error.message : "Transformarea nu este disponibilă");
    }
  }, [attachCamera, settings.fallbackModel, settings.framingSeconds, settings.mirrorSeconds]);

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
    if (!CAMERA_SCREENS.includes(screen)) return;
    void attachCamera().catch(() => {
      if (screen !== "attract") setGenerationError("Camera nu este disponibilă. Atinge ecranul și încearcă din nou.");
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
    if (screen === "choice") {
      const id = window.setTimeout(() => setScreen("healthy"), 7000);
      return () => window.clearTimeout(id);
    }
    if (screen === "healthy") {
      const id = window.setTimeout(() => setScreen("final"), 12000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen]);

  useEffect(() => {
    if (screen !== "consent") return;
    const id = window.setTimeout(reset, 20_000);
    return () => window.clearTimeout(id);
  }, [screen, reset]);

  useEffect(() => {
    if (screen !== "final" && screen !== "donate") return;
    setPresenceSeconds(screen === "donate" ? 45 : 20);
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
  }, [screen, reset]);

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
    track(event, { kiosk, meta: { version: "v2" } });
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
  const donationQr = `${origin}/doneaza?s=${currentSession()}&k=${encodeURIComponent(settings.kioskName)}&d=${encodeURIComponent("https://verticalfreedom.org/te-vezi-oglinda/")}`;

  return (
    <main className="v2-shell relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <video
        ref={videoRef}
        muted
        playsInline
        style={cameraStyle(settings, vp.w, vp.h)}
        className={`transition-opacity duration-1000 ${cameraVisible ? "opacity-100" : "opacity-0"}`}
      />
      {cameraVisible && <div className="video-grade" aria-hidden />}
      {cameraVisible && <div className="v2-grain" aria-hidden />}
      {(screen === "attract" || screen === "final" || screen === "donate") && <PinkParticles />}

      {prevBaldUrl && screen === "mirror" && (
        <img src={prevBaldUrl} alt="" aria-hidden className="v2-generated-portrait absolute inset-0 z-[3] h-full w-full" />
      )}
      {baldUrl && (screen === "mirror" || screen === "choice") && (
        <img
          key={baldUrl}
          src={baldUrl}
          alt="Portretul vizitatorului cu capul ras"
          className={`v2-generated-portrait absolute inset-0 z-[3] h-full w-full ${screen === "choice" ? "v2-bald-out" : "v2-bald-in"}`}
        />
      )}
      {smileUrl && screen === "choice" && (
        <img
          src={smileUrl}
          alt="Portretul vizitatorului zâmbind"
          className="v2-generated-portrait v2-smile-in absolute inset-0 z-[4] h-full w-full"
        />
      )}

      {screen === "attract" && (
        <section className="absolute inset-0 z-20 flex flex-col items-center justify-start px-[8vw] pt-[20vh] text-center" onClick={() => {
          void enterFullscreen();
          void attachCamera();
          startSession();
          track("start", { kiosk: settings.kioskName, meta: { version: "v2" } });
          setScreen("consent");
        }}>
          <Logos />
          <div className="v2-copy-stack v2-color-cycle v2-copy-enter v2-text-shade v2-highlight w-full max-w-[88vw]">
            <p className="v2-kicker">{messages.attractKicker}</p>
             <h1 className="v2-title v2-title-glow text-[clamp(3.75rem,10.9vw,9.05rem)] leading-[1.04]">{messages.attractTitle}</h1>
            <p className="v2-lede whitespace-pre-line text-[clamp(1.8rem,4vw,3.55rem)] leading-snug">{messages.attractSubtitle.replace(/\d+\s+secunde/i, `${settings.framingSeconds} secunde`)}</p>
          </div>
          <Button variant="outline" className="v2-action v2-action-white v2-cta-pulse v2-highlight mt-[3vh] h-auto px-[3vw] py-[1.2vh] text-[clamp(1.1rem,2.2vw,2rem)]">{messages.attractCta}</Button>
        </section>
      )}

      {screen === "consent" && (
        <section className="fade-in-slow absolute inset-0 z-20 flex flex-col justify-start bg-background/30 px-[8vw] pt-[6vh] backdrop-blur-xl">
          <RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight">
             <h2 className="v2-title text-[clamp(2.04rem,4.8vw,4.02rem)] leading-[1.08]">{messages.consentTitle}</h2>
            <p className="v2-lede max-w-[48ch] whitespace-pre-line text-[clamp(1.4rem,2.85vw,2.55rem)] leading-[1.38]">{messages.consentBody}</p>
          </RoseFrame>
          <Button variant="ghost" onClick={() => setConsent((value) => !value)} className="v2-highlight mt-[2vh] h-auto justify-start rounded-none px-0 py-3 text-left text-[clamp(1.1rem,2.2vw,2rem)] text-foreground hover:bg-transparent">
            <span className={`flex h-[1.1em] w-[1.1em] shrink-0 items-center justify-center border ${consent ? "border-primary text-primary" : "border-hairline"}`}>{consent ? "✓" : ""}</span>
            {messages.consentCheckbox}
          </Button>
          <Button disabled={!consent} onClick={() => { void startGeneration(); setScreen("framing"); }} className="v2-action mt-[2vh] h-auto w-full py-[1.5vh] text-[clamp(0.9rem,1.7vw,1.5rem)]">{messages.consentContinue}</Button>
          <div className="v2-highlight mt-[1.5vh] flex justify-between text-[clamp(0.75rem,1.4vw,1.2rem)] text-muted-foreground"><a href="/gdpr" className="underline underline-offset-8">Notă de confidențialitate</a><Button variant="ghost" onClick={reset} className="rounded-none text-[inherit]">{messages.consentDecline}</Button></div>
        </section>
      )}

      {screen === "framing" && (
        <section className="absolute inset-0 z-20 grid h-[49vh] grid-cols-[1fr_auto] items-start gap-[4vw] px-[7vw] pt-[6vh]">
           <RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight max-w-[66vw]"><p className="v2-kicker">{messages.framingKicker}</p><h2 className="v2-title text-[clamp(2.52rem,6vw,5.22rem)] leading-[1.06]">Privește-te {settings.framingSeconds} secunde.</h2></RoseFrame>
          <div className="v2-countdown v2-text-shade v2-highlight mt-[4vh] text-right"><p className="v2-title text-[clamp(3.75rem,10vw,8.5rem)] leading-none text-primary">{String(countdown).padStart(2, "0")}</p><p className="v2-kicker text-foreground/80">{messages.framingCaption}</p></div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="absolute inset-0 z-20">
          <div className="absolute inset-x-[6vw] top-[5vh] z-20 grid max-h-[44vh] grid-cols-1 content-start gap-[2vh]">
              <RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight max-w-[82vw]"><p className="v2-kicker">O posibilă schimbare</p><h2 className="v2-title text-[clamp(2.34rem,5.52vw,4.86rem)] leading-[1.06]">{messages.mirrorKicker}</h2></RoseFrame>
             {!baldUrl && <p className="v2-plate v2-lede v2-highlight breathe max-w-[70vw] text-[clamp(1.2rem,2.4vw,2.15rem)]">{processing ? messages.mirrorWorking : generationError || "Imaginea reală rămâne cu tine."}</p>}
             {baldUrl && <p className="v2-plate v2-lede v2-highlight max-w-[74vw] whitespace-pre-line text-[clamp(1.2rem,2.4vw,2.15rem)] leading-[1.3]">{messages.mirrorTitle}{"\n"}{messages.mirrorFooter}</p>}
          </div>
        </section>
      )}

        {screen === "choice" && <section className="absolute inset-0 z-20"><RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight absolute left-[5vw] top-[6vh] max-w-[68vw]"><p className="v2-kicker">{messages.choiceKicker}</p><h2 className="v2-title v2-title-glow text-[clamp(2.28rem,5.4vw,4.74rem)] leading-[1.06]">{messages.choiceTitle}</h2></RoseFrame></section>}

        {screen === "healthy" && <section className="absolute inset-x-[6vw] top-[6vh] z-20 grid max-h-[43vh] content-start gap-[2vh]"><RoseFrame className="v2-copy-enter v2-highlight max-w-[84vw]"><h2 className="v2-title text-[clamp(2.28rem,5.28vw,4.74rem)] leading-[1.08] text-primary">{messages.healthyTitle}</h2></RoseFrame><p className="v2-plate v2-lede v2-copy-enter v2-highlight max-w-[84vw] whitespace-pre-line text-[clamp(1.45rem,2.9vw,2.6rem)] leading-[1.35]">{messages.healthyBody}</p></section>}

      {screen === "final" && (
        <section className="absolute inset-0 z-20 flex flex-col px-[7vw] pt-[10vh]">
          <Logos />
            <RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight mt-[3vh] w-full max-w-[88vw]">
              <p className="v2-kicker">{messages.finalKicker}</p>
               <h2 className="v2-title v2-title-glow text-[clamp(2.22rem,5.52vw,4.92rem)] leading-[1.06]">{messages.finalTitleTop}</h2>
              {messages.finalTitleBottom && (
                 <h2 className="v2-title text-[clamp(2.22rem,5.52vw,4.92rem)] leading-[1.06] text-primary">{messages.finalTitleBottom}</h2>
              )}
              <p className="v2-lede max-w-[86vw] whitespace-pre-line text-[clamp(1.4rem,2.9vw,2.6rem)] leading-[1.32]">{messages.finalCause}</p>
              <p className="v2-lede v2-title-glow text-[clamp(1.35rem,2.75vw,2.45rem)] font-semibold leading-tight text-primary">{messages.finalSubtitle}</p>
              <p className="v2-title text-[clamp(1.1rem,2.3vw,2.1rem)] leading-none text-primary">{messages.finalButterfly}</p>
            </RoseFrame>
            <div className="mt-[2vh] flex w-full items-start justify-between gap-[5vw]"><div className="v2-highlight"><p className="mb-[1.5vh] text-[clamp(0.75rem,1.4vw,1.2rem)] uppercase tracking-[0.22em] text-primary">{messages.finalQrLabel}</p><Button onClick={() => { idleRef.current = Date.now(); setPresenceSeconds(20); }} variant="outline" className="v2-action h-auto px-[3vw] py-[1.2vh] text-[clamp(0.7rem,1.3vw,1.1rem)]">{messages.finalPresence}</Button><Button onClick={() => setScreen("donate")} variant="outline" className="v2-action ml-[2vw] h-auto px-[3vw] py-[1.2vh] text-[clamp(0.7rem,1.3vw,1.1rem)] uppercase">Donează</Button><p className="mt-3 text-[clamp(0.6rem,1.1vw,0.95rem)] text-muted-foreground">Resetare în {presenceSeconds}s</p></div><div className="v2-qr shrink-0 p-3"><QrCode value={donationQr} size={180} /></div></div>
        </section>
      )}

      {screen === "donate" && (
          <section className="absolute inset-0 z-20 flex max-h-[49vh] flex-col items-center px-[7vw] pt-[6vh] text-center"><Logos /><RoseFrame className="v2-copy-stack v2-color-cycle v2-copy-enter v2-highlight mt-[7vh]"><p className="v2-kicker">Vertical Freedom</p><h2 className="v2-title text-[clamp(2.18rem,5.76vw,5.1rem)] leading-none">DONEAZĂ<br /><span>ACUM.</span></h2><p className="v2-lede mx-auto max-w-[80vw] text-[clamp(1.3rem,2.6vw,2.35rem)]">Scanează codul și susține prevenția cancerului.</p></RoseFrame><div className="v2-qr mt-[1.5vh] p-3"><QrCode value={donationQr} size={220} /></div><div className="mt-[1.5vh] flex w-full items-start justify-between"><Button onClick={() => setScreen("final")} variant="outline" className="v2-action h-auto px-[3vw] py-[1vh] text-[clamp(0.7rem,1.3vw,1.1rem)]">Înapoi</Button><p className="v2-highlight text-[clamp(0.6rem,1.1vw,0.95rem)] text-muted-foreground">Resetare în {presenceSeconds}s</p></div></section>
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