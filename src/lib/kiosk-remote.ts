export type KioskScreen =
  | "attract"
  | "consent"
  | "framing"
  | "mirror"
  | "choice"
  | "healthy"
  | "final"
  | "donate";

export type KioskTelemetry = {
  kioskName: string;
  currentScreen: KioskScreen;
  cameraOk: boolean;
  aiOk: boolean;
  aiLatencyMs: number | null;
  lastAiSuccessAt: string | null;
  lastError: string | null;
  sessionActive: boolean;
};

const ID_KEY = "mirror.remote.id.v1";
const TOKEN_KEY = "mirror.remote.token.v1";

function remoteIdentity() {
  let kioskId = window.localStorage.getItem(ID_KEY) ?? "";
  let token = window.localStorage.getItem(TOKEN_KEY) ?? "";
  if (!token) {
    token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  return { kioskId, token };
}

/** ASCII summary: "1080x1920@2|screen 1080x1920|fullscreen". No camera data. */
function viewportReport() {
  const fs = Boolean(document.fullscreenElement) ||
    window.matchMedia("(display-mode: fullscreen)").matches;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const fillsScreen = Math.abs(window.innerHeight - screen.height) <= 2 && Math.abs(window.innerWidth - screen.width) <= 2;
  const mode = fs ? "fullscreen" : standalone ? "app" : fillsScreen ? "fullscreen" : "browser";
  return `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}|screen ${screen.width}x${screen.height}|${mode}`;
}

export async function syncKiosk(telemetry: KioskTelemetry): Promise<void> {
  const identity = remoteIdentity();
  const { osOrientation, isFlipped, applyFlip, watchFlip } = await import("@/lib/kiosk-flip");
  watchFlip();
  const o = osOrientation();
  const response = await fetch("/api/public/kiosk-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Viewport": viewportReport(),
    },
    body: JSON.stringify({ ...identity, ...telemetry, orientation: `${o.type} ${o.angle}°`, flipped: isFlipped() }),
  });
  if (!response.ok) throw new Error(`Monitorizare ${response.status}`);
  const result = (await response.json()) as {
    kioskId?: string;
    flipMode?: "auto" | "on" | "off";
    command?: { id: string; command: "refresh" | "reset_experience" | "test_ai" | "ping" | "screenshot" };
  };
  if (result.kioskId && result.kioskId !== identity.kioskId) {
    window.localStorage.setItem(ID_KEY, result.kioskId);
  }
  if (result.flipMode) applyFlip(result.flipMode);
  if (!result.command) return;

  await fetch("/api/public/kiosk-sync", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kioskId: result.kioskId ?? identity.kioskId,
      token: identity.token,
      commandId: result.command.id,
      result: "Comandă primită de tabletă",
    }),
  });

  if (result.command.command === "screenshot") {
    try {
      const shot = await captureScreen(isFlipped());
      await fetch("/api/public/kiosk-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kioskId: result.kioskId ?? identity.kioskId, token: identity.token, commandId: result.command.id, result: "Captură trimisă", screenshot: shot }),
      });
    } catch { /* non-fatal */ }
    return;
  }
  if (result.command.command === "ping") {
    const { runPing } = await import("@/lib/debug-log");
    void runPing();
    return;
  }
  if (result.command.command === "refresh") window.location.reload();
  if (result.command.command === "reset_experience") window.location.assign("/");
}

/** Screen capture WITHOUT camera: <video> elements are skipped, so no visitor image leaves the tablet. */
async function captureScreen(flipped: boolean): Promise<string> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const scale = Math.min(1, 480 / window.innerWidth);
  const src = await html2canvas(document.body, {
    scale,
    backgroundColor: "#000",
    logging: false,
    ignoreElements: (el) => el.tagName === "VIDEO" || el.hasAttribute("data-camera") || (el instanceof HTMLImageElement && /^(data|blob):/.test(el.src)),
  });
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  if (flipped) { ctx.translate(out.width, out.height); ctx.rotate(Math.PI); }
  ctx.drawImage(src, 0, 0);
  return out.toDataURL("image/jpeg", 0.6);
}
