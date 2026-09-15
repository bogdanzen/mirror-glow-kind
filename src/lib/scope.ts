import { scopeProxy } from "./runpod.functions";
import type { MirrorSettings } from "./settings";
import type { MirrorSession, MirrorStatus } from "./mirror";

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

type ModelStatus = {
  downloaded?: boolean;
  progress?: {
    is_downloading?: boolean;
    percentage?: number;
    current_artifact?: string;
  } | null;
};

async function ensureModels(pipeline: string, onStatus?: (s: MirrorStatus, d?: string) => void) {
  let status = await call(`/api/v1/models/status?pipeline_id=${encodeURIComponent(pipeline)}`, "GET");
  let model = status.body as ModelStatus | null;
  if (status.ok && model?.downloaded) return;

  if (!model?.progress?.is_downloading) {
    const started = await call("/api/v1/models/download", "POST", { pipeline_id: pipeline });
    if (!started.ok) {
      throw new Error(started.error || `Descărcarea modelului a eșuat (${started.status})`);
    }
  }

  const deadline = Date.now() + 1_800_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    status = await call(`/api/v1/models/status?pipeline_id=${encodeURIComponent(pipeline)}`, "GET");
    model = status.body as ModelStatus | null;
    if (status.ok && model?.downloaded) return;
    if (!status.ok) {
      onStatus?.("creating", "GPU-ul repornește; descărcarea va fi reluată");
      await waitForServer(onStatus);
      continue;
    }
    const percentage = model?.progress?.percentage;
    const detail = percentage != null ? `model: ${Math.round(percentage)}%` : "model: se descarcă";
    onStatus?.("creating", detail);
  }
  throw new Error("Modelul nu s-a descărcat la timp");
}

async function loadPipeline(pipeline: string, onStatus?: (s: MirrorStatus, d?: string) => void) {
  await ensureModels(pipeline, onStatus);
  const load = await call("/api/v1/pipeline/load", "POST", { pipeline_ids: [pipeline] });
  if (!load.ok) throw new Error(load.error || `Pornirea modelului a eșuat (${load.status})`);
  const deadline = Date.now() + 600_000; // first run downloads model weights
  while (Date.now() < deadline) {
    const res = await call("/api/v1/pipeline/status", "GET");
    const pipelineState = res.body as { status?: string; error?: string | null } | null;
    const status = pipelineState?.status;
    if (status === "loaded") return;
    if (status === "error") {
      throw new Error(pipelineState?.error || "Pipeline-ul Scope a eșuat la încărcare");
    }
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

  const outputTrack = processedStream.getVideoTracks()[0];
  if (!outputTrack) {
    pc.close();
    throw new Error("GPU-ul nu a trimis o pistă video");
  }
  if (outputTrack.muted) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        outputTrack.removeEventListener("unmute", handleUnmute);
        reject(new Error("GPU-ul s-a conectat, dar nu a trimis cadre video"));
      }, 90_000);
      const handleUnmute = () => {
        clearTimeout(timer);
        resolve();
      };
      outputTrack.addEventListener("unmute", handleUnmute, { once: true });
    }).catch((error: Error) => {
      pc.close();
      throw error;
    });
  }

  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.srcObject = processedStream;
  await probe.play().catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 90_000;
    const check = () => {
      if (probe.videoWidth > 0 && probe.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("GPU-ul s-a conectat, dar nu a produs cadre video"));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  }).catch((error: Error) => {
    probe.srcObject = null;
    pc.close();
    throw error;
  });
  probe.srcObject = null;

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
