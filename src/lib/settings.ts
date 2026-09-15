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
};

export const MODEL_OPTIONS = [
  "stabilityai/sdxl-turbo",
  "stabilityai/sd-turbo",
  "Lykon/dreamshaper-8",
  "prompthero/openjourney-v4",
] as const;

export const DEFAULT_PROMPT =
  "photorealistic portrait of the same person with a completely shaved head, chemotherapy patient, natural skin, identical face, same lighting, same background";

export const DEFAULT_SETTINGS: MirrorSettings = {
  prompt: DEFAULT_PROMPT,
  width: 512,
  height: 512,
  fps: 15,
  cameraDeviceId: "",
  demoMode: false,
  storageEnabled: false,
  pin: "0000",
  mirrorSeconds: 20,
  captureSeconds: 30,
  thanksSeconds: 15,
  idleTimeoutSeconds: 45,
  campaignLine: "SCHIMBAREA ÎNCEPE ÎNAINTE SĂ DOARĂ.",
  modelId: "stabilityai/sdxl-turbo",
  delta: 0.55,
  seed: 42,
  steps: 2,
};

const KEY = "mirror.settings.v1";
const COUNTER_KEY = "mirror.sessions.v1";

export function loadSettings(): MirrorSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<MirrorSettings>) };
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
