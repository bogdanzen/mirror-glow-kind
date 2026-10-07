import { useEffect, useRef, useState } from "react";
import type { MirrorSettings } from "@/lib/settings";
import home from "@/assets/vo-Home_screen.mp3.asset.json";
import consent from "@/assets/vo-Consent.mp3.asset.json";
import countdown from "@/assets/vo-Countdown.mp3.asset.json";
import transformed from "@/assets/vo-Transformed.mp3.asset.json";
import prevention from "@/assets/vo-Prevention.mp3.asset.json";
import finalScreen from "@/assets/vo-Final_Screen.mp3.asset.json";

const VOICE: Record<string, string> = {
  attract: home.url,
  consent: consent.url,
  framing: countdown.url,
  mirror: transformed.url,
  choice: prevention.url,
  final: finalScreen.url,
};

function playlistId(url: string): string {
  try {
    const u = new URL(url.trim());
    return u.searchParams.get("list") ?? "";
  } catch {
    return "";
  }
}

/** Builds a slow, soft healing pad (432 Hz family) with Web Audio — no files, loops forever. */
function startHealing(volume: number) {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 4);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.connect(master).connect(ctx.destination);
  const notes = [108, 162, 216, 270, 324];
  const nodes: AudioScheduledSourceNode[] = [];
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.12 / (i + 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03 + i * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08 / (i + 1);
    lfo.connect(lfoGain).connect(g.gain);
    osc.connect(g).connect(filter);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  return {
    setVolume: (v: number) => master.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.5),
    resume: () => void ctx.resume(),
    stop: () => {
      nodes.forEach((n) => n.stop());
      void ctx.close();
    },
  };
}

export function KioskAudio({ screen, settings, muted }: { screen: string; settings: MirrorSettings; muted: boolean }) {
  const [unlocked, setUnlocked] = useState(false);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const volume = muted ? 0 : settings.musicVolume / 100;

  // Browsers allow sound only after the first touch on the screen.
  useEffect(() => {
    const unlock = () => setUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Voiceover for the current screen; on the opening screen it repeats every 3 minutes.
  useEffect(() => {
    if (!unlocked || muted || !settings.voiceoverEnabled) return;
    const src = VOICE[screen];
    if (!src) return;
    let audio: HTMLAudioElement | null = null;
    const play = () => {
      audio?.pause();
      audio = new Audio(src);
      voiceRef.current = audio;
      audio.play().catch(() => {});
    };
    play();
    const repeat = screen === "attract" ? window.setInterval(play, 3 * 60 * 1000) : null;
    return () => {
      if (repeat !== null) window.clearInterval(repeat);
      audio?.pause();
      if (audio) audio.src = "";
    };
  }, [screen, unlocked, muted, settings.voiceoverEnabled]);

  // Built-in healing music.
  const healingRef = useRef<ReturnType<typeof startHealing> | null>(null);
  useEffect(() => {
    if (!unlocked || settings.musicMode !== "healing") return;
    const h = startHealing(0);
    healingRef.current = h;
    h.resume();
    return () => {
      h.stop();
      healingRef.current = null;
    };
  }, [unlocked, settings.musicMode]);
  useEffect(() => {
    healingRef.current?.setVolume(volume * 0.6);
  }, [volume, settings.musicMode, unlocked]);

  // YouTube playlist volume via the iframe API messages.
  const ytRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const w = ytRef.current?.contentWindow;
    if (!w) return;
    const send = (func: string, args: unknown[] = []) =>
      w.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    send("setVolume", [Math.round(volume * 100)]);
    send("unMute");
  }, [volume]);

  const list = settings.musicMode === "youtube" ? playlistId(settings.youtubeUrl) : "";
  if (!unlocked || !list) return null;
  return (
    <iframe
      ref={ytRef}
      title="Muzică de fundal"
      aria-hidden
      tabIndex={-1}
      allow="autoplay; encrypted-media"
      className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
      src={`https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&loop=1&controls=0&enablejsapi=1&playsinline=1`}
      onLoad={(e) => {
        const w = e.currentTarget.contentWindow;
        w?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [Math.round(volume * 100)] }), "*");
        w?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      }}
    />
  );
}
