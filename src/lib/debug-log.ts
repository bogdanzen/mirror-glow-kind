/**
 * Timing log for diagnosing slowness on the real tablet. Only durations and
 * labels — never images or anything identifying a person.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentSession } from "@/lib/metrics";

export type DebugKind = "step" | "ai" | "ping";

let kioskName = "";
export function setDebugKiosk(name: string) {
  kioskName = name.slice(0, 60);
}

/** Fire-and-forget: logging must never slow or break the experience. */
export function logTiming(kind: DebugKind, label: string, ms: number | null, meta: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const row = {
    source: "kiosk",
    kind,
    label: label.slice(0, 80),
    ms: ms == null ? null : Math.max(0, Math.round(ms)),
    session_id: currentSession().slice(0, 80),
    kiosk: kioskName || null,
    meta,
  };
  void Promise.resolve(supabase.from("debug_timings").insert(row)).catch(() => {});
}

/** Measures round-trip time from the tablet to our server, several times. */
export async function runPing(count = 5): Promise<number[]> {
  const results: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t0 = performance.now();
    try {
      await fetch(`/api/bald?ping=${Date.now()}`, { cache: "no-store" });
      results.push(Math.round(performance.now() - t0));
    } catch {
      results.push(-1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const ok = results.filter((v) => v >= 0).sort((a, b) => a - b);
  const median = ok.length ? ok[Math.floor(ok.length / 2)] : null;
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; downlink?: number } }).connection;
  logTiming("ping", "Ping tabletă → server", median, {
    samples: results,
    min: ok[0] ?? null,
    max: ok[ok.length - 1] ?? null,
    lost: results.length - ok.length,
    net: conn ? { type: conn.effectiveType, rtt: conn.rtt, downlink: conn.downlink } : null,
  });
  return results;
}
