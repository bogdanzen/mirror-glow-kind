/**
 * Anonymous kiosk analytics. No image, no name, no identifier of a person —
 * only which step was reached, when, and from which device type.
 */
import { supabase } from "@/integrations/supabase/client";

export const FUNNEL = [
  "start",
  "consent",
  "framing",
  "mirror",
  "choice",
  "prevention",
  "final",
] as const;

export type FunnelStep = (typeof FUNNEL)[number];
export type MirrorEventName = FunnelStep | "qr_scan" | "donate_click";

export const EVENT_LABELS: Record<MirrorEventName, string> = {
  start: "S-au oprit în fața oglinzii",
  consent: "Au acceptat condițiile",
  framing: "Au intrat în numărătoare",
  mirror: "Au văzut chipul transformat",
  choice: "Au ajuns la „Încă poți alege”",
  prevention: "Au văzut mesajul de prevenție",
  final: "Au ajuns la ecranul final",
  qr_scan: "Au scanat codul QR",
  donate_click: "Au apăsat „Donează”",
};

let sessionId = "";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function startSession(): string {
  sessionId = makeId();
  return sessionId;
}

export function currentSession(): string {
  if (!sessionId) sessionId = makeId();
  return sessionId;
}

export type TrackOptions = {
  sessionId?: string;
  device?: "kiosk" | "phone";
  kiosk?: string;
  meta?: Record<string, unknown>;
};

/** Fire-and-forget: analytics must never break the experience. */
export function track(event: MirrorEventName, options: TrackOptions = {}) {
  if (typeof window === "undefined") return;
  const row = {
    session_id: options.sessionId ?? currentSession(),
    event,
    device: options.device ?? "kiosk",
    kiosk: options.kiosk ?? null,
    meta: options.meta ?? {},
  };
  void supabase
    .from("mirror_events")
    .insert(row)
    .then(undefined, () => undefined);
}

export type MirrorEventRow = {
  created_at: string;
  session_id: string;
  event: string;
  device: string;
  kiosk: string | null;
};

export async function fetchEvents(sinceIso: string | null): Promise<MirrorEventRow[]> {
  let query = supabase
    .from("mirror_events")
    .select("created_at, session_id, event, device, kiosk")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MirrorEventRow[];
}

export type Totals = {
  sessions: number;
  steps: Record<FunnelStep, number>;
  qrScans: number;
  donations: number;
  abandoned: number;
  dropPerStep: { step: FunnelStep; label: string; reached: number; lost: number }[];
  kiosks: { name: string; sessions: number }[];
};

export function summarize(rows: MirrorEventRow[]): Totals {
  const bySession = new Map<string, Set<string>>();
  const kiosks = new Map<string, Set<string>>();
  let qrScans = 0;
  let donations = 0;

  for (const row of rows) {
    if (row.event === "qr_scan") qrScans += 1;
    if (row.event === "donate_click") donations += 1;
    const set = bySession.get(row.session_id) ?? new Set<string>();
    set.add(row.event);
    bySession.set(row.session_id, set);
    if (row.event === "start") {
      const name = row.kiosk || "Totem";
      const list = kiosks.get(name) ?? new Set<string>();
      list.add(row.session_id);
      kiosks.set(name, list);
    }
  }

  const steps = Object.fromEntries(FUNNEL.map((s) => [s, 0])) as Record<FunnelStep, number>;
  for (const events of bySession.values()) {
    for (const step of FUNNEL) if (events.has(step)) steps[step] += 1;
  }

  const sessions = steps.start;
  const dropPerStep = FUNNEL.map((step, index) => {
    const reached = steps[step];
    const next = FUNNEL[index + 1];
    return {
      step,
      label: EVENT_LABELS[step],
      reached,
      lost: next ? Math.max(0, reached - steps[next]) : 0,
    };
  });

  return {
    sessions,
    steps,
    qrScans,
    donations,
    abandoned: Math.max(0, sessions - steps.final),
    dropPerStep,
    kiosks: [...kiosks.entries()]
      .map(([name, set]) => ({ name, sessions: set.size }))
      .sort((a, b) => b.sessions - a.sessions),
  };
}
