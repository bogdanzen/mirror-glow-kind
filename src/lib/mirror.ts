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
  /** Measured time from session start to the first decoded processed frame. */
  startupMs?: number;
  stop: () => Promise<void>;
};

export type StartOptions = {
  settings: MirrorSettings;
  cameraStream?: MediaStream | null;
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined;
};

/** Requests the best stable camera input, preferring 4K and falling back. */
export async function getCamera(settings: MirrorSettings): Promise<MediaStream> {
  const base: MediaTrackConstraints = settings.cameraDeviceId
    ? { deviceId: { exact: settings.cameraDeviceId } }
    : { facingMode: "user" };

  const ladder: MediaTrackConstraints[] = [
    { ...base, width: { ideal: settings.cameraWidth }, height: { ideal: settings.cameraHeight } },
    { ...base, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { ...base },
  ];

  let lastError: unknown;
  for (const video of ladder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      const track = stream.getVideoTracks()[0];
      const s = track?.getSettings();
      const { diag } = await import("./diag");
      diag("camera", `intrare ${s?.width ?? "?"}×${s?.height ?? "?"} @ ${s?.frameRate ?? "?"} fps`);
      return stream;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Camera nu este disponibilă");
}

/** Loads the model on the GPU ahead of time so sessions start instantly. */
export async function prewarmMirror(
  settings: MirrorSettings,
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined,
): Promise<void> {
  const { prewarmScope, startScopeKeepAlive } = await import("./scope");
  startScopeKeepAlive(settings.scopePipeline);
  await prewarmScope(settings.scopePipeline, onStatus, settings.outputLongEdge);
}

/** Re-loads the model at the current screen resolution (no machine restart). */
export async function reloadMirrorResolution(settings: MirrorSettings): Promise<void> {
  const { reloadScopeAtViewport } = await import("./scope");
  await reloadScopeAtViewport(settings.scopePipeline, settings.outputLongEdge);
}


/** Live warm-up state for the diagnostics UI. */
export async function subscribeMirrorWarm(
  fn: (s: import("./scope").WarmState) => void,
): Promise<() => void> {
  const { subscribeWarm } = await import("./scope");
  return subscribeWarm(fn);
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

/** Clears a terminal warm-up failure (used by the repair action). */
export async function resetMirrorWarm(): Promise<void> {
  const { resetWarmState } = await import("./scope");
  resetWarmState();
}
