import { createBroadcast, createPlayer } from "@daydreamlive/browser";
import {
  createDaydreamStream,
  deleteDaydreamStream,
  type CreateStreamResult,
} from "./daydream.functions";
import type { MirrorSettings } from "./settings";

export type MirrorStatus = "creating" | "publishing" | "live" | "error" | "ended";

export type MirrorSession = {
  streamId: string;
  /** WebRTC stream with the AI output, when WHEP playback succeeded. */
  processedStream: MediaStream | null;
  /** Hosted player URL (lvpr.tv) — used as fallback when WHEP is unavailable. */
  playbackUrl: string;
  cameraStream: MediaStream;
  stop: () => Promise<void>;
};

export type StartOptions = {
  settings: MirrorSettings;
  cameraStream?: MediaStream | null;
  onStatus?: (status: MirrorStatus, detail?: string) => void;
};

async function getCamera(settings: MirrorSettings): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: settings.cameraDeviceId
      ? {
          deviceId: { exact: settings.cameraDeviceId },
          width: { ideal: settings.width },
          height: { ideal: settings.height },
        }
      : { facingMode: "user", width: { ideal: settings.width }, height: { ideal: settings.height } },
    audio: false,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Creates a Daydream stream (via the server function that holds the API key),
 * publishes the camera over WHIP and plays the AI-processed result over WHEP.
 * If WHEP never comes up, the session still resolves with the hosted playback
 * URL so the visitor sees the real AI output instead of falling back to demo.
 */
export async function startMirrorSession({
  settings,
  cameraStream,
  onStatus,
}: StartOptions): Promise<MirrorSession> {
  onStatus?.("creating");

  const result: CreateStreamResult = await createDaydreamStream({
    data: {
      prompt: settings.prompt,
      modelId: settings.modelId,
      width: settings.width,
      height: settings.height,
      delta: settings.delta,
      seed: settings.seed,
      steps: settings.steps,
    },
  });

  if (!result.ok) {
    onStatus?.("error", `${result.status || ""} ${result.message}`.trim());
    throw new Error(result.message);
  }

  const camera = cameraStream ?? (await getCamera(settings));
  onStatus?.("publishing");

  const makeBroadcast = () =>
    createBroadcast({
      whipUrl: result.whipUrl,
      stream: camera,
      connectionTimeout: 30000,
      video: { bitrate: 1_500_000, maxFramerate: settings.fps },
      reconnect: { enabled: true, maxAttempts: 5, baseDelayMs: 1000 },
    });

  let broadcast = makeBroadcast();
  try {
    await broadcast.connect();
  } catch (error) {
    await broadcast.stop().catch(() => undefined);
    await sleep(2000);
    broadcast = makeBroadcast();
    try {
      await broadcast.connect();
    } catch {
      void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
      onStatus?.("error", (error as Error).message);
      throw error;
    }
  }

  const whepUrl = broadcast.whepUrl?.replace(/^http:\/\//i, "https://") ?? "";

  // The AI worker needs 10-30s to warm up: the WHEP endpoint refuses the
  // connection until the output stream exists. Retry patiently.
  let processedStream: MediaStream | null = null;
  let player: ReturnType<typeof createPlayer> | null = null;

  if (whepUrl) {
    await sleep(4000);
    for (let attempt = 0; attempt < 15 && !processedStream; attempt += 1) {
      const p = createPlayer(whepUrl, {
        connectionTimeout: 15000,
        reconnect: { enabled: true, maxAttempts: 5, baseDelayMs: 1000 },
      });
      try {
        await p.connect();
        if (p.stream) {
          player = p;
          processedStream = p.stream;
          break;
        }
        await p.stop().catch(() => undefined);
      } catch {
        await p.stop().catch(() => undefined);
      }
      await sleep(2000);
    }
  }

  if (!processedStream && !result.playbackUrl) {
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("error", "Fluxul procesat nu a pornit");
    throw new Error("no processed output");
  }

  onStatus?.("live");

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await player?.stop().catch(() => undefined);
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("ended");
  };

  return {
    streamId: result.id,
    processedStream,
    playbackUrl: result.playbackUrl,
    cameraStream: camera,
    stop,
  };
}
