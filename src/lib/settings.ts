import { FALLBACK_MODELS, FALLBACK_PROMPT } from "./bald";

export type MirrorSettings = {
  prompt: string;
  width: number;
  height: number;
  fps: number;
  cameraDeviceId: string;
  demoMode: boolean;
  storageEnabled: boolean;
  pin: string;
  mirrorSeconds: number;
  captureSeconds: number;
  thanksSeconds: number;
  idleTimeoutSeconds: number;
  campaignLine: string;
  modelId: string;
  delta: number;
  seed: number;
  steps: number;
  /** Which inference backend drives the mirror. */
  provider: "runpod";
  /** Self-hosted Scope pipeline (RunPod provider). */
  scopePipeline: string;
  /** Optional TURN relay, required when the GPU host has no public IP. */
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
  /** Scope denoising schedule — fewer steps = lower latency. */
  scopeDenoiseSteps: number[];
  /** Verbose on-screen diagnostics. */
  diagnostics: boolean;
  /** Load the model on the GPU while the kiosk is idle. */
  prewarm: boolean;
  /** Long edge of the AI output; the short edge follows the screen ratio. */
  outputLongEdge: number;
  /** How far the model may drift from the real face (lower = clearer). */
  noiseScale: number;
  /** Preferred camera capture size (falls back automatically). */
  cameraWidth: number;
  cameraHeight: number;
  /** Server fallback: one still portrait rendered by AI, no GPU needed. */
  fallbackMode: boolean;
  /** Prompt used by the server fallback. */
  fallbackPrompt: string;
  /** How often the fallback portrait is regenerated. */
  fallbackRefresh: "off" | "normal" | "fast";
  /** Image model used by the fallback. */
  fallbackModel: string;
};

// Doar Krea rulează acum: celelalte pipeline-uri ar descărca modele inutile.
export const SCOPE_PIPELINES = ["krea-realtime-video"] as const;

export const MODEL_OPTIONS = [
  "stabilityai/sdxl-turbo",
  "stabilityai/sd-turbo",
  "Lykon/dreamshaper-8",
  "prompthero/openjourney-v4",
] as const;

export const DEFAULT_PROMPT =
  "ultra sharp photorealistic close-up portrait of the exact same person, completely bald: smooth hairless scalp with no hair and no stubble, clean-shaven face, no beard, no moustache, very thin almost invisible eyebrows, no eyelashes, slightly pale skin, undistorted natural facial proportions, identical face shape, identical eyes, nose and mouth, same expression, same clothes, same background and lighting unchanged, crisp fine skin texture and pores, studio-grade clarity, high detail, professional documentary photograph, sharp focus, no warping, no melting, no extra limbs, no blur";

export const DEFAULT_SETTINGS: MirrorSettings = {
  prompt: DEFAULT_PROMPT,
  width: 512,
  height: 512,
  fps: 15,
  cameraDeviceId: "",
  demoMode: false,
  storageEnabled: false,
  pin: "0000",
  mirrorSeconds: 40,
  captureSeconds: 30,
  thanksSeconds: 15,
  idleTimeoutSeconds: 20,
  campaignLine: "PREVENȚIA ÎNCEPE ÎNAINTE SĂ DOARĂ.",
  modelId: "stabilityai/sdxl-turbo",
  delta: 0.45,
  seed: 42,
  steps: 2,
  provider: "runpod",
  scopePipeline: "krea-realtime-video",
  turnUrl: "",
  turnUsername: "",
  turnCredential: "",
  // Fewer, gentler steps: less drift from the real face, less distortion.
  scopeDenoiseSteps: [650, 500],
  diagnostics: false,
  prewarm: true,
  outputLongEdge: 768,
  noiseScale: 0.35,
  cameraWidth: 3840,
  cameraHeight: 2160,
  fallbackMode: true,
  fallbackPrompt: FALLBACK_PROMPT,
  fallbackRefresh: "normal",
  fallbackModel: "openai/gpt-image-2.5-flare",
};


const KEY = "mirror.settings.v7";
const COUNTER_KEY = "mirror.sessions.v1";

/**
 * Settings stored by older builds can hold shapes the GPU rejects with a 422
 * (e.g. a single number where a denoising schedule list is expected), so every
 * value that travels to Scope is normalised on load.
 */
export function sanitizeSettings(input: Partial<MirrorSettings>): MirrorSettings {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  const raw = merged.scopeDenoiseSteps as unknown;
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const steps = list
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  merged.scopeDenoiseSteps = steps.length ? steps : DEFAULT_SETTINGS.scopeDenoiseSteps;
  merged.prompt = String(merged.prompt || DEFAULT_PROMPT);
  merged.fallbackPrompt = String(merged.fallbackPrompt || FALLBACK_PROMPT);
  merged.fallbackMode = Boolean(merged.fallbackMode);
  merged.fallbackRefresh = (["off", "normal", "fast"] as const).includes(
    merged.fallbackRefresh as "off",
  )
    ? merged.fallbackRefresh
    : DEFAULT_SETTINGS.fallbackRefresh;
  merged.fallbackModel = FALLBACK_MODELS.includes(merged.fallbackModel as (typeof FALLBACK_MODELS)[number])
    ? merged.fallbackModel
    : DEFAULT_SETTINGS.fallbackModel;
  merged.scopePipeline = String(merged.scopePipeline || DEFAULT_SETTINGS.scopePipeline);
  const longEdge = Math.round(Number(merged.outputLongEdge));
  merged.outputLongEdge = Number.isFinite(longEdge)
    ? Math.min(1280, Math.max(320, longEdge))
    : DEFAULT_SETTINGS.outputLongEdge;
  const noise = Number(merged.noiseScale);
  merged.noiseScale = Number.isFinite(noise)
    ? Math.min(1, Math.max(0, noise))
    : DEFAULT_SETTINGS.noiseScale;
  return merged;
}


export function loadSettings(): MirrorSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw) as Partial<MirrorSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: MirrorSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function bumpSessionCounter() {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(COUNTER_KEY);
  let data: { date: string; count: number } = { date: today(), count: 0 };
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }
  if (data.date !== today()) data = { date: today(), count: 0 };
  data.count += 1;
  window.localStorage.setItem(COUNTER_KEY, JSON.stringify(data));
}

export function readSessionCounter(): number {
  if (typeof window === "undefined") return 0;
  try {
    const data = JSON.parse(window.localStorage.getItem(COUNTER_KEY) ?? "{}");
    return data.date === today() ? (data.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

/* ---------- Session log (local, last 50) ---------- */

export type SessionLogEntry = {
  at: number;
  status: "live" | "demo" | "error" | "test";
  latencyMs?: number;
  error?: string;
};

const LOG_KEY = "mirror.log.v1";

export function readSessionLog(): SessionLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]") as SessionLogEntry[];
  } catch {
    return [];
  }
}

export function appendSessionLog(entry: SessionLogEntry) {
  if (typeof window === "undefined") return;
  const list = [...readSessionLog(), entry].slice(-50);
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function clearSessionLog() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LOG_KEY);
}
