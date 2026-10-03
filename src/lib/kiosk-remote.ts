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

export async function syncKiosk(telemetry: KioskTelemetry): Promise<void> {
  const identity = remoteIdentity();
  const response = await fetch("/api/public/kiosk-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kiosk-Viewport": `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
    },
    body: JSON.stringify({ ...identity, ...telemetry }),
  });
  if (!response.ok) throw new Error(`Monitorizare ${response.status}`);
  const result = (await response.json()) as {
    kioskId?: string;
    command?: { id: string; command: "refresh" | "reset_experience" | "test_ai" };
  };
  if (result.kioskId && result.kioskId !== identity.kioskId) {
    window.localStorage.setItem(ID_KEY, result.kioskId);
  }
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

  if (result.command.command === "refresh") window.location.reload();
  if (result.command.command === "reset_experience") window.location.assign("/");
}