import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { FuseLines, NeonButterfly, PreventionIcon } from "@/components/v4-decor";
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
    if (screen === "choice") {
      const id = window.setTimeout(() => setScreen("final"), (settings.captureSeconds + settings.thanksSeconds) * 1000);
      return () => window.clearTimeout(id);
    }
    if (screen === "healthy") {
      const id = window.setTimeout(() => setScreen("final"), settings.thanksSeconds * 1000);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, settings.captureSeconds, settings.thanksSeconds]);


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

/*__RETURN__*/
