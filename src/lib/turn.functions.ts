import { createServerFn } from "@tanstack/react-start";

/**
 * Short-lived relay credentials for the kiosk.
 *
 * The rented GPU machine has no public address of its own, so without a relay
 * the processed video never reaches the screen. Scope only knows how to ask
 * Hugging Face's relay, which has been switched off, so the mirror mints its
 * own Cloudflare credentials here instead.
 *
 * The long-lived key secret stays on the server. What goes to the browser is a
 * temporary username and password that Cloudflare expires on its own.
 */

const TURN_API = "https://rtc.live.cloudflare.com";
/** Cloudflare accepts up to 48 hours; a kiosk session never needs that much. */
const MAX_TTL = 86_400;
const DEFAULT_TTL = 3_600;

export type TurnIceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type TurnResult = {
  ok: boolean;
  iceServers: TurnIceServer[];
  /** Why the relay is unavailable. Empty when `ok`. */
  error: string;
  ttl: number;
};

export const mirrorTurnCredentials = createServerFn({ method: "GET" })
  .validator((input: { ttl?: number }) => input ?? {})
  .handler(async ({ data }): Promise<TurnResult> => {
    const keyId = process.env["CLOUDFLARE_TURN_KEY_ID"] ?? "";
    const keyToken = process.env["CLOUDFLARE_TURN_KEY_API_TOKEN"] ?? "";
    const ttl = Math.min(Math.max(Math.round(data.ttl ?? DEFAULT_TTL), 60), MAX_TTL);

    if (!keyId || !keyToken) {
      return { ok: false, iceServers: [], error: "cheie TURN Cloudflare lipsă", ttl };
    }

    try {
      const res = await fetch(
        `${TURN_API}/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keyToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl }),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          iceServers: [],
          error: `Cloudflare TURN ${res.status}: ${text.slice(0, 200)}`,
          ttl,
        };
      }
      const body = JSON.parse(text) as {
        iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
      };
      const iceServers: TurnIceServer[] = (body.iceServers ?? []).map((server) => ({
        urls: Array.isArray(server.urls) ? server.urls : [server.urls],
        ...(server.username ? { username: server.username } : {}),
        ...(server.credential ? { credential: server.credential } : {}),
      }));
      return { ok: true, iceServers, error: "", ttl };
    } catch (error) {
      return { ok: false, iceServers: [], error: (error as Error).message, ttl };
    }
  });
