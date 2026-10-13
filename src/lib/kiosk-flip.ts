/**
 * Upside-down tablet compensation. The tablet has no motion sensor, so we rely
 * on the orientation the OS reports: a portrait kiosk that boots in
 * "portrait-secondary" (180°) shows everything inverted to visitors.
 * Mode "auto" counter-rotates in that case; "on"/"off" are remote overrides.
 */
export type FlipMode = "auto" | "on" | "off";

const MODE_KEY = "mirror.flip.mode.v1";

export function osOrientation(): { type: string; angle: number } {
  if (typeof window === "undefined") return { type: "unknown", angle: 0 };
  const o = window.screen?.orientation;
  if (o) return { type: o.type, angle: o.angle };
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return { type: "legacy", angle: typeof legacy === "number" ? ((legacy % 360) + 360) % 360 : 0 };
}

export function shouldFlip(mode: FlipMode, angle: number): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return angle === 180;
}

export function readFlipMode(): FlipMode {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "on" || v === "off" ? v : "auto";
}

export function isFlipped(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("kiosk-flipped");
}

/** Applies the 180° turn to the whole page (camera preview included). */
export function applyFlip(mode: FlipMode = readFlipMode()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_KEY, mode);
  document.documentElement.classList.toggle("kiosk-flipped", shouldFlip(mode, osOrientation().angle));
}

let watching = false;
export function watchFlip() {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  applyFlip();
  const again = () => applyFlip();
  window.screen?.orientation?.addEventListener?.("change", again);
  window.addEventListener("orientationchange", again);
}
