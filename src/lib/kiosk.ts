let wakeLock: { release: () => Promise<void> } | null = null;

export async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (nav.wakeLock) wakeLock = await nav.wakeLock.request("screen");
  } catch {
    /* unsupported */
  }
}

export async function enterFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* user gesture required */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.("portrait");
  } catch {
    /* unsupported */
  }
}

export function installKioskHardening() {
  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener("contextmenu", prevent);
  document.addEventListener("gesturestart", prevent);
  document.addEventListener("dragstart", prevent);
  const onVisible = () => {
    if (document.visibilityState === "visible" && wakeLock === null) void requestWakeLock();
  };
  document.addEventListener("visibilitychange", onVisible);
  void requestWakeLock();
  return () => {
    document.removeEventListener("contextmenu", prevent);
    document.removeEventListener("gesturestart", prevent);
    document.removeEventListener("dragstart", prevent);
    document.removeEventListener("visibilitychange", onVisible);
    void wakeLock?.release();
    wakeLock = null;
  };
}
