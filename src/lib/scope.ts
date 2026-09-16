import { scopeProxy } from "./runpod.functions";
import type { MirrorSettings } from "./settings";
import type { MirrorSession, MirrorStatus } from "./mirror";
import { diag } from "./diag";

/**
 * Client for a self-hosted Daydream Scope server running on a RunPod GPU.
 * HTTP signalling goes through the `scopeProxy` server function (no CORS,
 * no pod URL in the browser); the media itself is a direct WebRTC peer
 * connection between the kiosk and the pod.
 */

type ScopeCall = { ok: boolean; status: number; body: unknown; error: string };

async function call(path: string, method: string, body?: unknown): Promise<ScopeCall> {
  const started = performance.now();
  const res = await scopeProxy({
    data: { path, method, ...(body !== undefined ? { body } : {}) },
  });
  let parsed: unknown = res.text;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    /* plain text */
  }
  const ms = Math.round(performance.now() - started);
  diag(
    "http",
    `${method} ${path} → ${res.ok ? "OK" : "FAIL"} ${res.status} (${ms} ms)${
      res.error ? ` ${res.error}` : ""
    }`,
    res.ok ? "info" : "warn",
  );
  return { ok: res.ok, status: res.status, body: parsed, error: res.error };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(onStatus?: (s: MirrorStatus, d?: string) => void) {
  diag("gpu", "aștept serverul Scope (/health)");
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const res = await call("/health", "GET");
    if (res.ok) {
      diag("gpu", "serverul Scope răspunde");
      return;
    }
    onStatus?.("creating", res.error ?? `server GPU: ${res.status}`);
    await sleep(3000);
  }
  diag("gpu", "serverul Scope nu a răspuns în 10 minute", "error");
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
  if (status.ok && model?.downloaded) {
    diag("model", `${pipeline}: deja descărcat`);
    return;
  }

  if (!model?.progress?.is_downloading) {
    diag("model", `${pipeline}: pornesc descărcarea`);
    const started = await call("/api/v1/models/download", "POST", { pipeline_id: pipeline });
    if (!started.ok) {
      throw new Error(started.error || `Descărcarea modelului a eșuat (${started.status})`);
    }
  }

  const deadline = Date.now() + 3_600_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    status = await call(`/api/v1/models/status?pipeline_id=${encodeURIComponent(pipeline)}`, "GET");
    model = status.body as ModelStatus | null;
    if (status.ok && model?.downloaded) {
      diag("model", `${pipeline}: descărcare completă`);
      return;
    }
    if (!status.ok) {
      diag("model", "GPU indisponibil temporar; reiau descărcarea", "warn");
      onStatus?.("creating", "GPU-ul repornește; descărcarea va fi reluată");
      await waitForServer(onStatus);
      continue;
    }
    const percentage = model?.progress?.percentage;
    const artifact = model?.progress?.current_artifact;
    const detail = percentage != null ? `model: ${Math.round(percentage)}%` : "model: se descarcă";
    diag("model", `${detail}${artifact ? ` · ${artifact}` : ""}`);
    onStatus?.("creating", detail);
  }
  throw new Error("Modelul nu s-a descărcat la timp");
}

async function loadPipeline(pipeline: string, onStatus?: (s: MirrorStatus, d?: string) => void) {
  await ensureModels(pipeline, onStatus);
  diag("pipeline", `încarc ${pipeline}`);
  const load = await call("/api/v1/pipeline/load", "POST", { pipeline_ids: [pipeline] });
  if (!load.ok) throw new Error(load.error || `Pornirea modelului a eșuat (${load.status})`);
  const deadline = Date.now() + 900_000; // first run loads weights into VRAM
  while (Date.now() < deadline) {
    const res = await call("/api/v1/pipeline/status", "GET");
    const pipelineState = res.body as { status?: string; error?: string | null } | null;
    const status = pipelineState?.status;
    if (status === "loaded") {
      diag("pipeline", `${pipeline} încărcat în VRAM`);
      return;
    }
    if (status === "error") {
      diag("pipeline", `eroare: ${pipelineState?.error ?? "necunoscută"}`, "error");
      throw new Error(pipelineState?.error || "Pipeline-ul Scope a eșuat la încărcare");
    }
    diag("pipeline", `stare: ${status ?? "se pregătește"}`);
    onStatus?.("creating", `model: ${status ?? "se pregătește"}`);
    await sleep(2500);
  }
  throw new Error("Modelul nu s-a încărcat la timp");
}

/* ---------- Pre-warm ---------- */

let warmPipeline: string | null = null;
let warmPromise: Promise<void> | null = null;
let keepAliveId: number | null = null;

/**
 * Downloads weights and loads the pipeline ahead of time so a visitor's
 * session starts in real time instead of waiting minutes for a cold GPU.
 * Safe to call repeatedly: the same in-flight promise is reused.
 */
export function prewarmScope(
  pipeline: string,
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined,
): Promise<void> {
  if (warmPromise && warmPipeline === pipeline) return warmPromise;
  warmPipeline = pipeline;
  diag("prewarm", `pre-încălzire ${pipeline}`);
  warmPromise = (async () => {
    await waitForServer(onStatus);
    await loadPipeline(pipeline, onStatus);
    diag("prewarm", "GPU pregătit — sesiunile pornesc instant");
  })().catch((error: Error) => {
    diag("prewarm", `eșuat: ${error.message}`, "error");
    warmPromise = null;
    warmPipeline = null;
    throw error;
  });
  return warmPromise;
}

export function isScopeWarm(pipeline: string) {
  return warmPipeline === pipeline && warmPromise !== null;
}

/** Keeps the pipeline resident between visitors and re-warms if it drops. */
export function startScopeKeepAlive(pipeline: string) {
  if (typeof window === "undefined") return;
  if (keepAliveId !== null) window.clearInterval(keepAliveId);
  keepAliveId = window.setInterval(() => {
    void (async () => {
      const res = await call("/api/v1/pipeline/status", "GET");
      const state = (res.body as { status?: string } | null)?.status;
      diag("keepalive", `pipeline: ${res.ok ? (state ?? "necunoscut") : `HTTP ${res.status}`}`);
      if (res.ok && state === "loaded") return;
      warmPromise = null;
      warmPipeline = null;
      void prewarmScope(pipeline).catch(() => undefined);
    })();
  }, 60_000);
}

export function stopScopeKeepAlive() {
  if (keepAliveId !== null && typeof window !== "undefined") window.clearInterval(keepAliveId);
  keepAliveId = null;
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
  diag("session", `pornesc sesiunea (${settings.scopePipeline})`);
  // Reuses the pre-warmed pipeline when available; otherwise warms now.
  await prewarmScope(settings.scopePipeline, onStatus);

  const ice = await call("/api/v1/webrtc/ice-servers", "GET");
  const iceServers =
    (ice.body as { iceServers?: RTCIceServer[] } | null)?.iceServers ??
    ([{ urls: "stun:stun.l.google.com:19302" }] as RTCIceServer[]);
  diag("webrtc", `${iceServers.length} servere ICE`);

  const pc = new RTCPeerConnection({ iceServers });
  let sessionId: string | null = null;
  const queued: RTCIceCandidate[] = [];

  const dataChannel = pc.createDataChannel("parameters", { ordered: true });

  pc.oniceconnectionstatechange = () => diag("webrtc", `ICE: ${pc.iceConnectionState}`);
  pc.onconnectionstatechange = () =>
    diag(
      "webrtc",
      `conexiune: ${pc.connectionState}`,
      pc.connectionState === "failed" ? "error" : "info",
    );

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
        diag("webrtc", "pistă video primită de la GPU");
        clearTimeout(timer);
        resolve(stream);
      }
    };
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed") {
        clearTimeout(timer);
        reject(new Error("Conexiunea WebRTC cu GPU-ul a eșuat (firewall / TURN)"));
      }
    });
  });

  for (const track of cameraStream.getVideoTracks()) pc.addTrack(track, cameraStream);

  onStatus?.("publishing");
  diag("webrtc", "trimit oferta SDP");
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
    diag("webrtc", `oferta respinsă (${answerRes.status})`, "error");
    throw new Error(answerRes.error ?? `Scope offer ${answerRes.status}`);
  }
  sessionId = answer.sessionId ?? null;
  diag("webrtc", `răspuns SDP primit · sesiune ${sessionId ?? "?"}`);
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
    diag("frames", "aștept primele cadre (pista este mută)");
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
        diag("frames", `primul cadru procesat ${probe.videoWidth}×${probe.videoHeight}`);
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
  diag("session", "LIVE");

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
    diag("session", "sesiune închisă");
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
