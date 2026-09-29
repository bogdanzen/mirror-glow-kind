import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/QrCode";
import { CancerRibbon } from "@/components/NeonButterfly";
import { baldifyFrame, FALLBACK_PROMPT, frameToFile } from "@/lib/bald";
import { enterFullscreen, installKioskHardening } from "@/lib/kiosk";
import { currentSession, startSession, track } from "@/lib/metrics";
import { DEFAULT_SETTINGS, loadSettings, type MirrorSettings } from "@/lib/settings";
import verticalFreedomLogo from "@/assets/vertical-freedom-logo.png.asset.json";
import lionsClujLogo from "@/assets/lions-cluj-logo.png.asset.json";

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
    <div className="pointer-events-none absolute inset-x-[6vw] top-[4vh] z-30 flex items-start justify-between">
      <img src={verticalFreedomLogo.url} alt="Vertical Freedom" className="h-auto w-[clamp(8rem,24vw,21rem)] object-contain" />
      <img src={lionsClujLogo.url} alt="Lions Club Cluj-Napoca" className="h-auto w-[clamp(4rem,11vw,9rem)] object-contain" />
    </div>
  );
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
  const [baldUrl, setBaldUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [presenceSeconds, setPresenceSeconds] = useState(20);
  const [origin, setOrigin] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef<AbortController | null>(null);
  const generationStartedRef = useRef(false);
  const idleRef = useRef(Date.now());

  const attachCamera = useCallback(async () => {
    if (!streamRef.current) {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
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
    stopCamera();
    setConsent(false);
    setBaldUrl("");
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

    try {
      await attachCamera();
      const video = videoRef.current;
      if (!video) throw new Error("Camera nu este pregătită");
      const deadline = Date.now() + 3500;
      while (!video.videoWidth && Date.now() < deadline && !controller.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      const frame = frameToFile(video, 768);
      if (!frame) throw new Error("Nu am putut prelua imaginea camerei");
      await baldifyFrame(
        frame,
        FALLBACK_PROMPT,
        (url, isFinal) => {
          if (!isFinal || controller.signal.aborted) return;
          setBaldUrl(url);
          setProcessing(false);
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

  useEffect(() => {
    if (screen !== "mirror" || !baldUrl) return;
    const id = window.setTimeout(() => setScreen("choice"), settings.mirrorSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [screen, baldUrl, settings.mirrorSeconds]);

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
    if (screen === "attract") return;
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

  const messages = settings.messages;
  const cameraVisible = CAMERA_SCREENS.includes(screen);
  const donationQr = `${origin}/doneaza?s=${currentSession()}&k=${encodeURIComponent(settings.kioskName)}&d=${encodeURIComponent(settings.donateUrl)}`;

  return (
    <main className="v2-shell relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <video
        ref={videoRef}
        muted
        playsInline
        className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-1000 ${cameraVisible ? "opacity-100" : "opacity-0"}`}
      />
      {cameraVisible && <div className="video-grade" aria-hidden />}
      {cameraVisible && <div className="v2-grain" aria-hidden />}
      {(screen === "attract" || screen === "final" || screen === "donate") && <PinkParticles />}

      {baldUrl && (screen === "mirror" || screen === "choice") && (
        <img
          src={baldUrl}
          alt="Portretul vizitatorului cu capul ras"
          className={`absolute inset-0 z-[3] h-full w-full scale-x-[-1] object-cover ${screen === "choice" ? "v2-bald-out" : "v2-bald-in"}`}
        />
      )}

      {screen === "attract" && (
        <section className="absolute inset-0 z-20 flex flex-col items-center justify-center px-[8vw] text-center" onClick={() => {
          void enterFullscreen();
          void attachCamera();
          startSession();
          track("start", { kiosk: settings.kioskName, meta: { version: "v2" } });
          setScreen("consent");
        }}>
          <Logos />
          <p className="mb-[3vh] text-[clamp(0.75rem,1.4vw,1.2rem)] uppercase tracking-[0.4em] text-muted-foreground">{messages.attractKicker}</p>
          <h1 className="neon-title font-display text-[clamp(4.5rem,14vw,12rem)] leading-[0.86]">{messages.attractTitle}</h1>
          <p className="mt-[5vh] whitespace-pre-line text-[clamp(1.1rem,2.6vw,2.4rem)] leading-snug text-foreground/85">{messages.attractSubtitle.replace(/\d+\s+secunde/i, `${settings.framingSeconds} secunde`)}</p>
          <p className="breathe mt-[7vh] border-y border-primary/60 py-[2vh] text-[clamp(1rem,2.2vw,2rem)] text-primary">{messages.attractCta}</p>
        </section>
      )}

      {screen === "consent" && (
        <section className="fade-in-slow absolute inset-0 z-20 flex flex-col justify-center bg-background px-[8vw]">
          <h2 className="font-display text-[clamp(2.8rem,7vw,6rem)] leading-none">{messages.consentTitle}</h2>
          <p className="mt-[5vh] max-w-[48ch] whitespace-pre-line text-[clamp(1rem,2vw,1.8rem)] leading-relaxed text-muted-foreground">{messages.consentBody}</p>
          <Button variant="ghost" onClick={() => setConsent((value) => !value)} className="mt-[6vh] h-auto justify-start rounded-none px-0 py-5 text-left text-[clamp(1rem,2vw,1.8rem)] text-foreground hover:bg-transparent">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center border ${consent ? "border-primary text-primary" : "border-hairline"}`}>{consent ? "✓" : ""}</span>
            {messages.consentCheckbox}
          </Button>
          <Button disabled={!consent} onClick={() => setScreen("framing")} className="mt-[5vh] h-auto w-full rounded-none border-y border-primary bg-transparent py-[3vh] text-[clamp(1.3rem,3vw,2.7rem)] text-primary shadow-none hover:bg-primary/10">{messages.consentContinue}</Button>
          <div className="mt-[5vh] flex justify-between text-muted-foreground"><a href="/gdpr" className="underline underline-offset-8">Notă de confidențialitate</a><Button variant="ghost" onClick={reset} className="rounded-none">{messages.consentDecline}</Button></div>
        </section>
      )}

      {screen === "framing" && (
        <section className="absolute inset-0 z-20 flex flex-col justify-between px-[7vw] py-[8vh]">
          <div><p className="uppercase tracking-[0.38em] text-primary">{messages.framingKicker}</p><h2 className="mt-4 max-w-[9ch] font-display text-[clamp(4rem,11vw,9rem)] leading-[0.88]">Privește-te {settings.framingSeconds} secunde.</h2></div>
          <div className="self-end text-right"><p className="font-display text-[clamp(8rem,23vw,19rem)] leading-none text-primary">{String(countdown).padStart(2, "0")}</p><p className="uppercase tracking-[0.32em] text-foreground/70">{messages.framingCaption}</p></div>
        </section>
      )}

      {screen === "mirror" && (
        <section className="absolute inset-0 z-20">
          <div className="absolute left-[7vw] top-[7vh] z-20 max-w-[75vw]"><p className="uppercase tracking-[0.36em] text-primary">{messages.mirrorKicker}</p><h2 className="mt-4 max-w-[11ch] font-display text-[clamp(3.7rem,10vw,8.5rem)] leading-[0.9]">{messages.mirrorTitle}</h2></div>
          {!baldUrl && <div className="absolute inset-x-0 bottom-[7vh] z-20 text-center"><p className="breathe text-[clamp(1rem,2vw,1.8rem)] text-foreground/85">{processing ? messages.mirrorWorking : generationError || "Imaginea reală rămâne cu tine."}</p></div>}
          {baldUrl && <p className="absolute bottom-[7vh] left-[7vw] z-20 max-w-[24ch] whitespace-pre-line text-[clamp(1rem,2vw,1.8rem)] leading-relaxed text-foreground/80">{messages.mirrorFooter}</p>}
        </section>
      )}

      {screen === "choice" && <section className="absolute inset-0 z-20"><div className="absolute left-[6vw] top-[6vh] max-w-[44vw]"><p className="uppercase tracking-[0.4em] text-muted-foreground">{messages.choiceKicker}</p><h2 className="neon-title mt-[2vh] font-display text-[clamp(3.4rem,9vw,8rem)] leading-[0.88]">{messages.choiceTitle}</h2></div></section>}

      {screen === "healthy" && <section className="absolute inset-0 z-20"><h2 className="absolute left-[7vw] top-[8vh] max-w-[12ch] font-display text-[clamp(3.4rem,9vw,8rem)] leading-[0.9]">{messages.healthyTitle}</h2><p className="absolute bottom-[8vh] left-[7vw] max-w-[24ch] whitespace-pre-line text-[clamp(1.1rem,2.3vw,2rem)] leading-relaxed text-foreground/90">{messages.healthyBody}</p></section>}

      {screen === "final" && (
        <section className="absolute inset-0 z-20 flex flex-col px-[7vw] py-[7vh]">
          <Logos />
          <div className="mt-[12vh]"><p className="uppercase tracking-[0.42em] text-primary">{messages.finalKicker}</p><h2 className="mt-3 font-display text-[clamp(4rem,12vw,10rem)] leading-[0.82]">{messages.finalTitleTop}<br /><span className="text-primary">{messages.finalTitleBottom}</span></h2><p className="mt-[4vh] max-w-[22ch] text-[clamp(1.2rem,2.6vw,2.3rem)] leading-snug text-foreground/85">{messages.finalSubtitle}</p></div>
          <div className="mt-auto grid grid-cols-[1fr_auto] items-end gap-[5vw]"><div><p className="mb-[3vh] uppercase tracking-[0.28em] text-muted-foreground">{messages.finalQrLabel}</p><Button onClick={() => { idleRef.current = Date.now(); setPresenceSeconds(20); }} variant="outline" className="h-auto rounded-none border-primary/60 bg-transparent px-[3vw] py-[2vh] text-[clamp(1rem,2vw,1.7rem)] text-primary">{messages.finalPresence}</Button><Button onClick={() => setScreen("donate")} variant="outline" className="ml-[2vw] h-auto rounded-none border-primary bg-transparent px-[3vw] py-[2vh] text-[clamp(1rem,2vw,1.7rem)] uppercase text-primary">Donează</Button><p className="mt-4 text-sm text-muted-foreground">Resetare în {presenceSeconds}s</p></div><div className="flex flex-col items-center gap-5"><div className="bg-foreground p-3"><QrCode value={donationQr} size={180} /></div><CancerRibbon className="h-[13vh] w-auto text-primary" /></div></div>
        </section>
      )}

      {screen === "donate" && (
        <section className="absolute inset-0 z-20 flex flex-col items-center px-[7vw] py-[7vh] text-center"><Logos /><div className="mt-[15vh]"><p className="uppercase tracking-[0.42em] text-primary">Vertical Freedom</p><h2 className="mt-4 font-display text-[clamp(4rem,12vw,10rem)] leading-[0.84]">DONEAZĂ<br /><span className="text-primary">ACUM.</span></h2><p className="mx-auto mt-[4vh] max-w-[25ch] text-[clamp(1.2rem,2.5vw,2.2rem)] text-foreground/85">Scanează codul și susține prevenția cancerului.</p></div><div className="mt-[6vh] bg-foreground p-4"><QrCode value={donationQr} size={300} /></div><div className="mt-auto flex w-full items-end justify-between"><Button onClick={() => setScreen("final")} variant="outline" className="h-auto rounded-none border-hairline bg-transparent px-[3vw] py-[2vh] text-foreground">Înapoi</Button><p className="text-sm text-muted-foreground">Resetare în {presenceSeconds}s</p><CancerRibbon className="h-[13vh] w-auto text-primary" /></div></section>
      )}
    </main>
  );
}