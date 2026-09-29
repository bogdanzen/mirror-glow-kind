import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/AdminPanel";
import { QrCode } from "@/components/QrCode";
import { baldifyFrame, FALLBACK_PROMPT } from "@/lib/bald";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import { currentSession, startSession, track } from "@/lib/metrics";
import { cameraStyle, viewToFile } from "@/lib/cameraView";
import { DEFAULT_SETTINGS, loadSettings, type MirrorSettings } from "@/lib/settings";
import verticalFreedomLogo from "@/assets/vf-white.png.asset.json";
import lionsClujLogo from "@/assets/lions-white.png.asset.json";

export const Route = createFileRoute("/v2")({
  head: () => ({
    meta: [
      { title: "Oglinda V2 — Vertical Freedom" },
      {
        name: "description",
        content: "Experiența Oglinda, optimizată pentru tablete Android și campania Vertical Freedom.",
      },
      { property: "og:title", content: "Oglinda V2 — Vertical Freedom" },
      {
        property: "og:description",
        content: "O experiență interactivă despre prevenție, alegere și grijă față de tine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MirrorV2,
});

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

function MirrorV2() {
  const [settings, setSettings] = useState<MirrorSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<Screen>("attract");
  const [consent, setConsent] = useState(false);
  const [countdown, setCountdown] = useState(DEFAULT_SETTINGS.framingSeconds);
  const [baldUrl, setBaldUrlRaw] = useState("");
  const [prevBaldUrl, setPrevBaldUrl] = useState("");
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
    setGenerationError("");
    setProcessing(false);
    setCountdown(settings.framingSeconds);
    setPresenceSeconds(20);
    setScreen("attract");
  }, [settings.framingSeconds, stopCamera]);

  const startGeneration = useCallback(async () => {
    if (generationStartedRef.current) return;
    generationStartedRef.current = true;
    setProcessing(true);
    setGenerationError("");
    const controller = new AbortController();
    generationRef.current = controller;
    // Keep generating fresh portraits, one at a time, until the mirror window ends.
    const endBy = Date.now() + (settings.framingSeconds + settings.mirrorSeconds) * 1000;
    let produced = 0;

    try {
      await attachCamera();
      const video = videoRef.current;
      if (!video) throw new Error("Camera nu este pregătită");
      const deadline = Date.now() + 3500;
      while (!video.videoWidth && Date.now() < deadline && !controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      while (!controller.signal.aborted && (produced === 0 || (Date.now() < endBy - 8000 && !loopStopRef.current))) {
        const frame = viewToFile(video, settingsRef.current, window.innerWidth, window.innerHeight, 1024);
        if (!frame) throw new Error("Nu am putut prelua imaginea camerei");
        const first = produced === 0;
        try {
          await baldifyFrame(
            frame,
            FALLBACK_PROMPT,
            (url, isFinal) => {
              if (controller.signal.aborted) return;
              if (first || isFinal) setBaldUrl(url);
              if (isFinal) setProcessing(false);
            },
            controller.signal,
            settings.fallbackModel,
            first,
          );
          produced += 1;
        } catch (error) {
          if (produced === 0) throw error;
          break;
        }
      }
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
    Object.entries(settings.messages).map(([key, value]) => [key, typeof value === "string" ? value.replace(/\\n/g, "\n").replace(/\\r/g, "") : value]),
  ) as MirrorSettings["messages"];
  const cameraVisible = CAMERA_SCREENS.includes(screen);
  const donationQr = `${origin}/doneaza?s=${currentSession()}&k=${encodeURIComponent(settings.kioskName)}&d=${encodeURIComponent("https://verticalfreedom.org/doneaza")}`;

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

      {screen === "attract" && (
        <section className="absolute inset-0 z-20 flex flex-col items-center justify-start px-[8vw] pt-[20vh] text-center" onClick={() => {
          void enterFullscreen();
          void attachCamera();
          startSession();
          track("start", { kiosk: settings.kioskName, meta: { version: "v2" } });
          setScreen("consent");
        }}>
          <Logos />
          <div className="v2-copy-stack v2-copy-enter v2-text-shade v2-highlight w-full max-w-[88vw]">
            <p className="v2-kicker">{messages.attractKicker}</p>
            <h1 className="v2-title v2-title-glow text-[clamp(4rem,12vw,10rem)] leading-[0.94]">{messages.attractTitle}</h1>
            <p className="v2-lede whitespace-pre-line text-[clamp(1.08rem,2.4vw,2.16rem)] leading-snug">{messages.attractSubtitle.replace(/\d+\s+secunde/i, `${settings.framingSeconds} secunde`)}</p>
          </div>
          <p className="v2-cta-pulse v2-highlight mt-[3vh] text-[clamp(1rem,2vw,1.8rem)] text-primary">{messages.attractCta}</p>
        </section>
      )}

      {screen === "consent" && (
        <section className="fade-in-slow absolute inset-0 z-20 flex flex-col justify-start bg-background/30 px-[8vw] pt-[6vh] backdrop-blur-xl">
          <RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight">
            <h2 className="v2-title text-[clamp(2.8rem,6.8vw,5.8rem)] leading-none">{messages.consentTitle}</h2>
            <p className="v2-lede max-w-[48ch] whitespace-pre-line text-[clamp(1rem,1.9vw,1.72rem)] leading-[1.45]">{messages.consentBody}</p>
          </RoseFrame>
          <Button variant="ghost" onClick={() => setConsent((value) => !value)} className="v2-highlight mt-[2vh] h-auto justify-start rounded-none px-0 py-3 text-left text-[clamp(1rem,1.9vw,1.72rem)] text-foreground hover:bg-transparent">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center border ${consent ? "border-primary text-primary" : "border-hairline"}`}>{consent ? "✓" : ""}</span>
            {messages.consentCheckbox}
          </Button>
          <Button disabled={!consent} onClick={() => { void startGeneration(); setScreen("framing"); }} className="v2-action mt-[2vh] h-auto w-full py-[1.5vh] text-[clamp(1.2rem,2.6vw,2.36rem)]">{messages.consentContinue}</Button>
          <div className="v2-highlight mt-[1.5vh] flex justify-between text-[clamp(.9rem,1.5vw,1.35rem)] text-muted-foreground"><a href="/gdpr" className="underline underline-offset-8">Notă de confidențialitate</a><Button variant="ghost" onClick={reset} className="rounded-none text-[inherit]">{messages.consentDecline}</Button></div>
        </section>
      )}

      {screen === "framing" && (
        <section className="absolute inset-0 z-20 grid h-[49vh] grid-cols-[1fr_auto] items-start gap-[4vw] px-[7vw] pt-[6vh]">
          <RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight max-w-[62vw]"><p className="v2-kicker">{messages.framingKicker}</p><h2 className="v2-title max-w-[10ch] text-[clamp(3.7rem,9.2vw,7.8rem)] leading-[0.98]">Privește-te {settings.framingSeconds} secunde.</h2></RoseFrame>
          <div className="v2-countdown v2-text-shade v2-highlight mt-[4vh] text-right"><p className="v2-title text-[clamp(7.5rem,20vw,17rem)] leading-none text-primary">{String(countdown).padStart(2, "0")}</p><p className="v2-kicker text-foreground/80">{messages.framingCaption}</p></div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="absolute inset-0 z-20">
          <div className="absolute inset-x-[6vw] top-[5vh] z-20 grid max-h-[44vh] grid-cols-1 content-start gap-[2vh]">
            <RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight max-w-[82vw]"><p className="v2-kicker">O posibilă schimbare</p><h2 className="v2-title max-w-[12ch] text-[clamp(3.3rem,8.2vw,7.3rem)] leading-none">{messages.mirrorKicker}</h2></RoseFrame>
            {!baldUrl && <p className="v2-plate v2-lede v2-highlight breathe max-w-[32ch] text-[clamp(1rem,2vw,1.8rem)]">{processing ? messages.mirrorWorking : generationError || "Imaginea reală rămâne cu tine."}</p>}
            {baldUrl && <p className="v2-plate v2-lede v2-highlight max-w-[30ch] whitespace-pre-line text-[clamp(1rem,2vw,1.8rem)]">{messages.mirrorTitle}{"\n"}{messages.mirrorFooter}</p>}
          </div>
        </section>
      )}

        {screen === "choice" && <section className="absolute inset-0 z-20"><RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight absolute left-[5vw] top-[6vh] max-w-[62vw]"><p className="v2-kicker text-muted-foreground">{messages.choiceKicker}</p><h2 className="v2-title v2-title-glow text-[clamp(3.1rem,7.6vw,6.8rem)] leading-none">{messages.choiceTitle}</h2></RoseFrame></section>}

        {screen === "healthy" && <section className="absolute inset-x-[6vw] top-[6vh] z-20 grid max-h-[43vh] content-start gap-[2vh]"><RoseFrame className="v2-copy-enter v2-highlight max-w-[80vw]"><h2 className="v2-title max-w-[13ch] text-[clamp(3.1rem,7.4vw,6.8rem)] leading-[0.98]">{messages.healthyTitle}</h2></RoseFrame><p className="v2-plate v2-lede v2-copy-enter v2-highlight max-w-[32ch] whitespace-pre-line text-[clamp(1.12rem,2.3vw,2rem)] leading-[1.45]">{messages.healthyBody}</p></section>}

      {screen === "final" && (
        <section className="absolute inset-0 z-20 flex flex-col px-[7vw] py-[7vh]">
          <Logos />
            <RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight mt-[9vh]"><p className="v2-kicker">{messages.finalKicker}</p><h2 className="v2-title text-[clamp(3.65rem,9.6vw,8.5rem)] leading-[0.98]">{messages.finalTitleTop}<br /><span className="text-primary">{messages.finalTitleBottom}</span></h2><p className="v2-lede max-w-[24ch] text-[clamp(1.16rem,2.5vw,2.2rem)] leading-snug">{messages.finalSubtitle}</p></RoseFrame>
            <div className="absolute inset-x-[7vw] top-[38vh] grid grid-cols-[1fr_auto] items-start gap-[5vw]"><div className="v2-highlight"><p className="mb-[1.5vh] text-[clamp(.9rem,1.5vw,1.35rem)] uppercase tracking-[0.22em] text-muted-foreground">{messages.finalQrLabel}</p><Button onClick={() => { idleRef.current = Date.now(); setPresenceSeconds(20); }} variant="outline" className="v2-action h-auto px-[3vw] py-[1.2vh] text-[clamp(1rem,1.9vw,1.6rem)]">{messages.finalPresence}</Button><Button onClick={() => setScreen("donate")} variant="outline" className="v2-action ml-[2vw] h-auto px-[3vw] py-[1.2vh] text-[clamp(1rem,1.9vw,1.6rem)] uppercase">Donează</Button><p className="mt-3 text-[clamp(.82rem,1.3vw,1.2rem)] text-muted-foreground">Resetare în {presenceSeconds}s</p></div><div className="v2-qr p-3"><QrCode value={donationQr} size={180} /></div></div>
        </section>
      )}

      {screen === "donate" && (
          <section className="absolute inset-0 z-20 flex flex-col items-center px-[7vw] py-[6vh] text-center"><Logos /><RoseFrame className="v2-copy-stack v2-copy-enter v2-highlight mt-[9vh]"><p className="v2-kicker">Vertical Freedom</p><h2 className="v2-title text-[clamp(3.65rem,9.6vw,8.5rem)] leading-none">DONEAZĂ<br /><span className="text-primary">ACUM.</span></h2><p className="v2-lede mx-auto max-w-[26ch] text-[clamp(1.16rem,2.4vw,2.1rem)]">Scanează codul și susține prevenția cancerului.</p></RoseFrame><div className="v2-qr mt-[2vh] p-4"><QrCode value={donationQr} size={300} /></div><div className="absolute inset-x-[7vw] top-[45vh] flex items-start justify-between"><Button onClick={() => setScreen("final")} variant="outline" className="v2-action h-auto px-[3vw] py-[1.2vh] text-[clamp(1rem,1.9vw,1.6rem)]">Înapoi</Button><p className="v2-highlight text-[clamp(.82rem,1.3vw,1.2rem)] text-muted-foreground">Resetare în {presenceSeconds}s</p></div></section>
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