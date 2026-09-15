import { scopeProxy } from "./runpod.functions";
import type { MirrorSettings } from "./settings";
import type { MirrorSession, MirrorStatus } from "./daydream";

/**
 * Client for a self-hosted Daydream Scope server running on a RunPod GPU.
 * HTTP signalling goes through the `scopeProxy` server function (no CORS,
 * no pod URL in the browser); the media itself is a direct WebRTC peer
 * connection between the kiosk and the pod.
 */

type ScopeCall = { ok: boolean; status: number; body: unknown; error: string };

async function call(path: string, method: string, body?: unknown): Promise<ScopeCall> {
  const res = await scopeProxy({
    data: { path, method, ...(body !== undefined ? { body } : {}) },
  });
  let parsed: unknown = res.text;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    /* plain text */
  }
  return { ok: res.ok, status: res.status, body: parsed, error: res.error };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(onStatus?: (s: MirrorStatus, d?: string) => void) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const res = await call("/health", "GET");
    if (res.ok) return;
    onStatus?.("creating", res.error ?? `server GPU: ${res.status}`);
    await sleep(3000);
  }
  throw new Error("Serverul Scope nu a răspuns (pod pornit?)");
}

async function loadPipeline(pipeline: string, onStatus?: (s: MirrorStatus, d?: string) => void) {
  await call("/api/v1/pipeline/load", "POST", { pipeline_ids: [pipeline] });
  const deadline = Date.now() + 600_000; // first run downloads model weights
  while (Date.now() < deadline) {
    const res = await call("/api/v1/pipeline/status", "GET");
    const status = (res.body as { status?: string } | null)?.status;
    if (status === "loaded") return;
    if (status === "error") throw new Error("Pipeline-ul Scope a eșuat la încărcare");
    onStatus?.("creating", `model: ${status ?? "se pregătește"}`);
    await sleep(2500);
  }
  throw new Error("Modelul nu s-a încărcat la timp");
}

export async function startScopeSession({
  settings,
  cameraStream,
  onStatus,
}: {
  settings: MirrorSettings;
  cameraStream: MediaStream;
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined;
}): Promise<MirrorSession> {
  onStatus?.("creating");
  await waitForServer(onStatus);
  await loadPipeline(settings.scopePipeline, onStatus);

  const ice = await call("/api/v1/webrtc/ice-servers", "GET");
  const iceServers =
    (ice.body as { iceServers?: RTCIceServer[] } | null)?.iceServers ??
    ([{ urls: "stun:stun.l.google.com:19302" }] as RTCIceServer[]);

  const pc = new RTCPeerConnection({ iceServers });
  let sessionId: string | null = null;
  const queued: RTCIceCandidate[] = [];

  const dataChannel = pc.createDataChannel("parameters", { ordered: true });

  const sendCandidate = async (candidate: RTCIceCandidate) => {
    if (!sessionId) return;
    await call(`/api/v1/webrtc/offer/${sessionId}`, "PATCH", {
      candidates: [
        {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      ],
    });
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    if (sessionId) void sendCandidate(event.candidate);
    else queued.push(event.candidate);
  };

  const processed = new Promise<MediaStream>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fluxul procesat nu a sosit")), 90_000);
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        clearTimeout(timer);
        resolve(stream);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        clearTimeout(timer);
        reject(new Error("Conexiunea WebRTC cu GPU-ul a eșuat (firewall / TURN)"));
      }
    };
  });

  for (const track of cameraStream.getVideoTracks()) pc.addTrack(track, cameraStream);

  onStatus?.("publishing");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const answerRes = await call("/api/v1/webrtc/offer", "POST", {
    sdp: pc.localDescription?.sdp,
    type: pc.localDescription?.type,
    initialParameters: {
      input_mode: "video",
      prompts: [{ text: settings.prompt, weight: 1.0 }],
      denoising_step_list: settings.scopeDenoiseSteps,
      manage_cache: true,
    },
  });

  const answer = answerRes.body as { sdp?: string; type?: string; sessionId?: string } | null;
  if (!answerRes.ok || !answer?.sdp) {
    pc.close();
    throw new Error(answerRes.error ?? `Scope offer ${answerRes.status}`);
  }
  sessionId = answer.sessionId ?? null;
  await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  for (const candidate of queued.splice(0)) void sendCandidate(candidate);

  const processedStream = await processed.catch((error: Error) => {
    pc.close();
    throw error;
  });

  onStatus?.("live");

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      dataChannel.close();
    } catch {
      /* ignore */
    }
    pc.close();
    onStatus?.("ended");
  };

  return {
    streamId: sessionId ?? "scope",
    processedStream,
    playbackUrl: "",
    cameraStream,
    stop,
  };
}
