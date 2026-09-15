/**
 * Local capture store. Captures live in this browser only (no server storage)
 * unless cloud storage is explicitly enabled later. Entries expire after 24h.
 */
const KEY = "mirror.captures.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

type Entry = { id: string; dataUrl: string; createdAt: number };

function readAll(): Entry[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as Entry[];
    const now = Date.now();
    return list.filter((e) => now - e.createdAt < TTL_MS);
  } catch {
    return [];
  }
}

function writeAll(list: Entry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(-10)));
}

export function saveCapture(dataUrl: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  const list = readAll();
  list.push({ id, dataUrl, createdAt: Date.now() });
  try {
    writeAll(list);
  } catch {
    writeAll([{ id, dataUrl, createdAt: Date.now() }]);
  }
  return id;
}

export function getCapture(id: string): Entry | null {
  return readAll().find((e) => e.id === id) ?? null;
}
