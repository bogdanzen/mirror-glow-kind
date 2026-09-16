export type DiagLevel = "info" | "warn" | "error";

export type DiagEntry = {
  at: number;
  scope: string;
  message: string;
  level: DiagLevel;
};

const MAX = 200;
let entries: DiagEntry[] = [];
const listeners = new Set<(e: DiagEntry[]) => void>();

/** Verbose diagnostic trace for the mirror pipeline (GPU, model, WebRTC). */
export function diag(scope: string, message: string, level: DiagLevel = "info") {
  entries = [...entries, { at: Date.now(), scope, message, level }].slice(-MAX);
  for (const fn of listeners) fn(entries);
  if (typeof console !== "undefined") {
    const line = `[${scope}] ${message}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }
}

export function readDiag(): DiagEntry[] {
  return entries;
}

export function clearDiag() {
  entries = [];
  for (const fn of listeners) fn(entries);
}

export function subscribeDiag(fn: (e: DiagEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries);
  return () => listeners.delete(fn);
}
