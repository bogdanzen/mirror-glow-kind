import { demoProvider } from "./demo";
import { runpodProvider } from "./runpod";
import { scopeProvider } from "./scope";
import { falHairProvider, perfectcorpProvider } from "./server";
import type { FrameOptions, FrameProvider, ProviderConfig, ProviderId } from "./types";

export const PROVIDERS: Record<ProviderId, FrameProvider> = {
  runpod: runpodProvider,
  scope: scopeProvider,
  "fal-hair": falHairProvider,
  perfectcorp: perfectcorpProvider,
  demo: demoProvider,
};

export function getProvider(id: ProviderId): FrameProvider {
  return PROVIDERS[id] ?? demoProvider;
}

/* ---------- Log (last 20 lines, shared with the admin panel) ---------- */

export type ProviderLogEntry = {
  at: number;
  provider: ProviderId;
  latencyMs?: number;
  error?: string;
  note?: string;
};

const LOG_MAX = 20;
let log: ProviderLogEntry[] = [];
const listeners = new Set<(entries: ProviderLogEntry[]) => void>();

export function logProvider(entry: ProviderLogEntry) {
  log = [...log, entry].slice(-LOG_MAX);
  for (const fn of listeners) fn(log);
}

export function readProviderLog(): ProviderLogEntry[] {
  return log;
}

export function subscribeProviderLog(fn: (entries: ProviderLogEntry[]) => void): () => void {
  listeners.add(fn);
  fn(log);
  return () => listeners.delete(fn);
}

/* ---------- Fallback chain ---------- */

export type ChainOptions = {
  chain: ProviderId[];
  config: ProviderConfig;
  /** Switch to the next provider after this many consecutive failures. */
  maxFailures?: number;
  /** A response slower than this counts as a failure. */
  slowMs?: number;
  /** How often the preferred provider is retried in the background. */
  recoverMs?: number;
  onSwitch?: (provider: ProviderId, reason: string) => void;
};

/**
 * Keeps one active provider, demotes it after repeated failures or slow
 * answers, and quietly probes the preferred one so it can come back.
 */
export class ProviderChain {
  private chain: ProviderId[];
  private index = 0;
  private failures = 0;
  private lastProbe = 0;
  private opts: ChainOptions;

  constructor(opts: ChainOptions) {
    this.opts = opts;
    const list = opts.chain.filter((id) => id in PROVIDERS);
    this.chain = list.length ? list : ["demo"];
    if (!this.chain.includes("demo")) this.chain = [...this.chain, "demo"];
  }

  get active(): ProviderId {
    return this.chain[this.index] ?? "demo";
  }

  private demote(reason: string) {
    if (this.index >= this.chain.length - 1) return;
    this.index += 1;
    this.failures = 0;
    this.lastProbe = Date.now();
    logProvider({ at: Date.now(), provider: this.active, note: `comutat: ${reason}` });
    this.opts.onSwitch?.(this.active, reason);
  }

  /** Background attempt to return to a higher-priority provider. */
  private async tryRecover() {
    if (this.index === 0) return;
    const every = this.opts.recoverMs ?? 30000;
    if (Date.now() - this.lastProbe < every) return;
    this.lastProbe = Date.now();
    for (let i = 0; i < this.index; i += 1) {
      const id = this.chain[i];
      if (!id) continue;
      const provider = PROVIDERS[id];
      try {
        const ok = (await provider.health?.(this.opts.config)) ?? false;
        if (ok) {
          this.index = i;
          this.failures = 0;
          logProvider({ at: Date.now(), provider: id, note: "revenit (recuperat)" });
          this.opts.onSwitch?.(id, "recuperat");
          return;
        }
      } catch {
        /* still down */
      }
    }
  }

  /** Runs one frame through the chain; only "demo" is allowed to be last. */
  async run(frame: Blob, opts: Omit<FrameOptions, "config">): Promise<Blob> {
    void this.tryRecover();
    const slow = this.opts.slowMs ?? 3000;
    const maxFailures = this.opts.maxFailures ?? 3;

    for (let attempt = 0; attempt < this.chain.length; attempt += 1) {
      const id = this.active;
      const provider = PROVIDERS[id];
      const started = performance.now();
      try {
        const out = await provider.processFrame(frame, { ...opts, config: this.opts.config });
        const latency = Math.round(performance.now() - started);
        logProvider({ at: Date.now(), provider: id, latencyMs: latency });
        if (latency > slow && id !== "demo") {
          this.failures += 1;
          if (this.failures >= maxFailures) this.demote(`răspuns lent (${latency} ms)`);
        } else {
          this.failures = 0;
        }
        return out;
      } catch (error) {
        const message = (error as Error).message;
        logProvider({
          at: Date.now(),
          provider: id,
          latencyMs: Math.round(performance.now() - started),
          error: message,
        });
        if (id === "demo") throw error;
        this.failures += 1;
        if (this.failures >= maxFailures) this.demote(message);
        else return this.run(frame, opts);
      }
    }
    return demoProvider.processFrame(frame, { ...opts, config: this.opts.config });
  }
}

/** One-shot call used by the admin test button and the premium capture. */
export async function runProviderOnce(
  id: ProviderId,
  frame: Blob,
  opts: Omit<FrameOptions, "config">,
  config: ProviderConfig,
): Promise<{ blob: Blob; latencyMs: number }> {
  const started = performance.now();
  try {
    const blob = await getProvider(id).processFrame(frame, { ...opts, config });
    const latencyMs = Math.round(performance.now() - started);
    logProvider({ at: Date.now(), provider: id, latencyMs });
    return { blob, latencyMs };
  } catch (error) {
    logProvider({
      at: Date.now(),
      provider: id,
      latencyMs: Math.round(performance.now() - started),
      error: (error as Error).message,
    });
    throw error;
  }
}
