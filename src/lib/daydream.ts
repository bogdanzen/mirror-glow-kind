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
  processedStream: MediaStream;
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

  let broadcast = createBroadcast({ whipUrl: result.whipUrl, stream: camera });
  try {
    await broadcast.connect();
  } catch (error) {
    await broadcast.stop().catch(() => undefined);
    await sleep(2000);
    broadcast = createBroadcast({ whipUrl: result.whipUrl, stream: camera });
    try {
      await broadcast.connect();
    } catch {
      void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
      onStatus?.("error", (error as Error).message);
      throw error;
    }
  }

  const whepUrl = broadcast.whepUrl;
  if (!whepUrl) {
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("error", "Lipsă URL de redare");
    throw new Error("missing whep url");
  }

  const player = createPlayer(whepUrl);
  try {
    await player.connect();
  } catch (error) {
    await player.stop().catch(() => undefined);
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("error", (error as Error).message);
    throw error;
  }

  const processedStream = player.stream;
  if (!processedStream) {
    await player.stop().catch(() => undefined);
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("error", "Fără flux procesat");
    throw new Error("missing processed stream");
  }

  onStatus?.("live");

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await player.stop().catch(() => undefined);
    await broadcast.stop().catch(() => undefined);
    void deleteDaydreamStream({ data: { id: result.id } }).catch(() => undefined);
    onStatus?.("ended");
  };

  return { streamId: result.id, processedStream, cameraStream: camera, stop };
}
