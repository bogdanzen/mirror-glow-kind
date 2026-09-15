import type { MirrorSettings } from "./settings";

/**
 * Single entry point for the live mirror. The kiosk now talks only to the
 * self-hosted Daydream Scope server running on our own RunPod GPU.
 */

export type MirrorStatus = "creating" | "publishing" | "live" | "error" | "ended";

export type MirrorSession = {
  streamId: string;
  /** WebRTC stream carrying the AI-processed video. */
  processedStream: MediaStream | null;
  /** Kept for the UI contract; the self-hosted path has no hosted player. */
  playbackUrl: string;
  cameraStream: MediaStream;
  stop: () => Promise<void>;
};

export type StartOptions = {
  settings: MirrorSettings;
  cameraStream?: MediaStream | null;
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined;
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

export async function startMirrorSession({
  settings,
  cameraStream,
  onStatus,
}: StartOptions): Promise<MirrorSession> {
  onStatus?.("creating");
  const { startScopeSession } = await import("./scope");
  const camera = cameraStream ?? (await getCamera(settings));
  return startScopeSession({ settings, cameraStream: camera, onStatus });
}
