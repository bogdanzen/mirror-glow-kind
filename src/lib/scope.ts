import { scopeProxy } from "./runpod.functions";
import { mirrorTurnCredentials } from "./turn.functions";
import type { MirrorSettings } from "./settings";
import type { MirrorSession, MirrorStatus } from "./mirror";
import { diag } from "./diag";

/**
 * Client for a self-hosted Daydream Scope server running on a RunPod GPU.
 *
 * Everything model-related goes through ONE warm-up coordinator: a single
 * download, a single pipeline load, no concurrent retries. Concurrent callers
 * (kiosk screens, admin panel, keep-alive) observe the same operation instead
 * of starting another one — overlapping downloads are what corrupted the model
 * files on the previous pod.
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

/* ---------- Warm-up stages ---------- */

export type WarmStage =
  | "idle"
  | "pod"
  | "server"
  | "downloading"
  | "verifying"
  | "loading"
  | "probing"
  | "ready"
  | "error";

export type WarmState = {
  stage: WarmStage;
  detail: string;
  /** Set when the stage is terminal and needs operator action (e.g. corrupt models). */
  fatal: boolean;
  since: number;
};

let warmState: WarmState = { stage: "idle", detail: "", fatal: false, since: Date.now() };
const warmListeners = new Set<(s: WarmState) => void>();

export function readWarmState(): WarmState {
  return warmState;
}

export function subscribeWarm(fn: (s: WarmState) => void): () => void {
  warmListeners.add(fn);
  fn(warmState);
  return () => warmListeners.delete(fn);
}

function setStage(stage: WarmStage, detail = "", fatal = false) {
  warmState = { stage, detail, fatal, since: Date.now() };
  diag("warmup", `${stage}${detail ? ` · ${detail}` : ""}`, fatal ? "error" : "info");
  for (const fn of warmListeners) fn(warmState);
}

const CORRUPT_HINTS = [
  "incomplete metadata",
  "file not fully covered",
  "deserializing header",
  "No such file or directory",
];

function isCorruption(message: string) {
  const lower = message.toLowerCase();
  return CORRUPT_HINTS.some((h) => lower.includes(h.toLowerCase()));
}

function pipelineError(message: string) {
  if (/cuda out of memory|out of memory/i.test(message)) {
    return new Error(
      "GPU-ul nu are suficientă memorie pentru Krea (necesar: minimum 48 GB). Recreează pod-ul din panoul de administrare; va fi ales automat un GPU compatibil din Europa.",
    );
  }
  if (isCorruption(message)) return new ModelCorruptError(message);
  return new Error(message);
}

/* ---------- Server / model / pipeline steps ---------- */

async function waitForServer(deadlineMs = 600_000) {
  setStage("server", "aștept serverul GPU");
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const res = await call("/health", "GET");
    if (res.ok) {
      setStage("server", "serverul GPU răspunde");
      return;
    }
    setStage("server", `serverul GPU: ${res.error || res.status}`);
    await sleep(3000);
  }
  throw new Error("Serverul GPU nu a răspuns (pod pornit?)");
}

type ModelStatus = {
  downloaded?: boolean;
  progress?: {
    is_downloading?: boolean;
    percentage?: number;
    current_artifact?: string;
  } | null;
};

async function modelStatus(pipeline: string): Promise<{ ok: boolean; model: ModelStatus | null }> {
  const res = await call(
    `/api/v1/models/status?pipeline_id=${encodeURIComponent(pipeline)}`,
    "GET",
  );
  return { ok: res.ok, model: res.ok ? (res.body as ModelStatus | null) : null };
}

/**
 * Ensures the weights for `pipeline` are fully on disk. Starts AT MOST one
 * download and then only polls — it never issues a second download request
 * while one is in flight.
 */
async function ensureModels(pipeline: string) {
  let { ok, model } = await modelStatus(pipeline);
  if (ok && model?.downloaded) {
    setStage("verifying", "model deja descărcat");
    return;
  }

  if (!model?.progress?.is_downloading) {
    setStage("downloading", "pornesc descărcarea (o singură dată)");
    const started = await call("/api/v1/models/download", "POST", { pipeline_id: pipeline });
    if (!started.ok) {
      throw new Error(started.error || `Descărcarea modelului a eșuat (${started.status})`);
    }
  } else {
    setStage("downloading", "descărcare deja în curs");
  }

  const deadline = Date.now() + 3_600_000;
  let lastPercentage = -1;
  let stalledSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(5000);
    ({ ok, model } = await modelStatus(pipeline));
    if (ok && model?.downloaded) {
      setStage("verifying", "descărcare completă");
      return;
    }
    if (!ok) {
      // Proxy hiccup or container restart: wait for the server, then keep
      // polling. We deliberately do NOT re-issue the download request.
      setStage("downloading", "GPU indisponibil temporar; aștept");
      await waitForServer();
      continue;
    }
    const percentage = model?.progress?.percentage;
    const artifact = model?.progress?.current_artifact;
    if (percentage != null && percentage !== lastPercentage) {
      lastPercentage = percentage;
      stalledSince = Date.now();
    }
    if (Date.now() - stalledSince > 600_000) {
      throw new Error("Descărcarea modelului s-a blocat (fără progres 10 minute)");
    }
    setStage(
      "downloading",
      percentage != null
        ? `model: ${Math.round(percentage)}%${artifact ? ` · ${artifact}` : ""}`
        : "model: se descarcă",
    );
  }
  throw new Error("Modelul nu s-a descărcat la timp");
}

/** Loads the pipeline into VRAM. One request, then polling only. */
async function loadPipeline(pipeline: string) {
  const current = await call("/api/v1/pipeline/status", "GET");
  const currentState = current.body as { status?: string; pipeline_id?: string } | null;
  if (
    current.ok &&
    currentState?.status === "loaded" &&
    currentState.pipeline_id === pipeline
  ) {
    setStage("loading", `${pipeline} deja în VRAM`);
    return;
  }

  if (current.ok && currentState?.status === "loaded" && currentState.pipeline_id !== pipeline) {
    diag(
      "pipeline",
      `schimb ${currentState.pipeline_id ?? "pipeline necunoscut"} → ${pipeline}`,
    );
  }

  setStage("loading", `încarc ${pipeline}`);
  // Krea este un model de 14B: fără cuantizare fp8 și fără modulul VACE nu
  // încape nici pe 48 GB (CUDA out of memory). LightTAE îl face și mai rapid.
  const load = await call("/api/v1/pipeline/load", "POST", {
    pipeline_ids: [pipeline],
    load_params:
      pipeline === "krea-realtime-video"
        ? {
            quantization: "fp8_e4m3fn",
            vace_enabled: false,
            vae_type: "lighttae",
            height: 320,
            width: 576,
          }
        : undefined,
  });
  if (!load.ok) {
    const message = typeof load.body === "string" ? load.body : load.error;
    throw pipelineError(message || `Pornirea modelului a eșuat (${load.status})`);
  }

  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    const res = await call("/api/v1/pipeline/status", "GET");
    const state = res.body as {
      status?: string;
      pipeline_id?: string;
      error?: string | null;
    } | null;
    if (state?.status === "loaded" && state.pipeline_id === pipeline) {
      setStage("loading", `${pipeline} încărcat în VRAM`);
      return;
    }
    if (state?.status === "loaded" && state.pipeline_id !== pipeline) {
      setStage(
        "loading",
        `GPU raportează încă ${state.pipeline_id ?? "alt pipeline"}; aștept ${pipeline}`,
      );
      await sleep(2500);
      continue;
    }
    if (state?.status === "error") {
      const message = state.error || "pipeline-ul a eșuat la încărcare";
      throw pipelineError(message);
    }
    setStage("loading", `model: ${state?.status ?? "se pregătește"}`);
    await sleep(2500);
  }
  throw new Error("Modelul nu s-a încărcat la timp");
}

export class ModelCorruptError extends Error {
  constructor(detail: string) {
    super(
      `Fișierele modelului sunt corupte pe disc (${detail}). Folosește „Repară modelul” în panoul de administrare.`,
    );
    this.name = "ModelCorruptError";
  }
}

/* ---------- Single-owner warm-up ---------- */

let warmPipeline: string | null = null;
let warmPromise: Promise<void> | null = null;
let keepAliveId: number | null = null;

/**
 * Downloads weights, loads the pipeline and verifies a real processed frame.
 * Safe to call from anywhere: concurrent callers share the same promise, so
 * exactly one download and one load ever run at a time.
 */
export function prewarmScope(
  pipeline: string,
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined,
): Promise<void> {
  if (warmPromise && warmPipeline === pipeline) {
    if (onStatus) {
      const unsub = subscribeWarm((s) => onStatus("creating", s.detail || s.stage));
      void warmPromise.finally(unsub);
    }
    return warmPromise;
  }
  if (warmState.fatal && warmPipeline === pipeline) {
    return Promise.reject(new Error(warmState.detail));
  }

  warmPipeline = pipeline;
  const unsub = onStatus
    ? subscribeWarm((s) => onStatus("creating", s.detail || s.stage))
    : () => undefined;

  warmPromise = (async () => {
    await waitForServer();
    await ensureModels(pipeline);
    await loadPipeline(pipeline);
    setStage("probing", "verific un cadru procesat real");
    await probeProcessedFrame(pipeline);
    setStage("ready", "GPU pregătit — sesiunile pornesc instant");
  })()
    .catch((error: Error) => {
      const fatal = error instanceof ModelCorruptError;
      setStage("error", error.message, fatal);
      warmPromise = null;
      if (!fatal) warmPipeline = null;
      throw error;
    })
    .finally(unsub);

  return warmPromise;
}

export function isScopeReady(pipeline: string) {
  return warmPipeline === pipeline && warmState.stage === "ready";
}

/** Clears a terminal warm-up failure so a repair attempt can start fresh. */
export function resetWarmState() {
  warmPromise = null;
  warmPipeline = null;
  setStage("idle", "");
}

/** Keeps the pipeline resident between visitors and re-warms if it drops. */
export function startScopeKeepAlive(pipeline: string) {
  if (typeof window === "undefined") return;
  if (keepAliveId !== null) window.clearInterval(keepAliveId);
  keepAliveId = window.setInterval(() => {
    void (async () => {
      // Never interfere while a warm-up or a session is already in flight.
      if (warmPromise || activeSessions > 0 || warmState.fatal) return;
      const res = await call("/api/v1/pipeline/status", "GET");
      const state = (res.body as { status?: string } | null)?.status;
      diag("keepalive", `pipeline: ${res.ok ? (state ?? "necunoscut") : `HTTP ${res.status}`}`);
      if (res.ok && state === "loaded") return;
      resetWarmState();
      void prewarmScope(pipeline).catch(() => undefined);
    })();
  }, 60_000);
}

export function stopScopeKeepAlive() {
  if (keepAliveId !== null && typeof window !== "undefined") window.clearInterval(keepAliveId);
  keepAliveId = null;
}

/* ---------- WebRTC ---------- */

let activeSessions = 0;

type Stage = { name: string; at: number };

function stageTimer() {
  const started = performance.now();
  let last = started;
  const stages: Stage[] = [];
  return {
    mark(name: string) {
      const now = performance.now();
      stages.push({ name, at: Math.round(now - started) });
      diag("stage", `${name} +${Math.round(now - last)} ms (total ${Math.round(now - started)} ms)`);
      last = now;
    },
    total() {
      return Math.round(performance.now() - started);
    },
    stages,
  };
}

/**
 * Opens a WebRTC session against Scope and resolves once a real processed
 * frame has been decoded. Every step is timed so diagnostics name the exact
 * failing stage instead of showing an endless spinner.
 */
async function openSession({
  settings,
  cameraStream,
  onStatus,
}: {
  settings: MirrorSettings;
  cameraStream: MediaStream;
  onStatus?: ((status: MirrorStatus, detail?: string) => void) | undefined;
}): Promise<MirrorSession> {
  const timer = stageTimer();
  activeSessions += 1;

  const [ice, turn] = await Promise.all([
    call("/api/v1/webrtc/ice-servers", "GET"),
    mirrorTurnCredentials({ data: { ttl: 3600 } }).catch(() => null),
  ]);
  const iceServers: RTCIceServer[] = [
    ...((ice.body as { iceServers?: RTCIceServer[] } | null)?.iceServers ??
      ([{ urls: "stun:stun.l.google.com:19302" }] as RTCIceServer[])),
  ];
  // Operator-supplied relay (needed when the GPU host has no public IP).
  if (settings.turnUrl) {
    iceServers.push({
      urls: settings.turnUrl,
      username: settings.turnUsername,
      credential: settings.turnCredential,
    });
  }
  // Short-lived Cloudflare relay credentials, minted server-side.
  for (const server of turn?.iceServers ?? []) iceServers.push(server as RTCIceServer);
  if (turn && !turn.ok) diag("webrtc", `releu Cloudflare indisponibil: ${turn.error}`, "warn");
  const hasTurn = iceServers.some((s) =>
    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => String(u).startsWith("turn")),
  );
  diag("webrtc", `${iceServers.length} servere ICE${hasTurn ? " (TURN disponibil)" : " (doar STUN)"}`,
    hasTurn ? "info" : "warn");
  timer.mark("ice-servers");

  const pc = new RTCPeerConnection({ iceServers });
  let sessionId: string | null = null;
  const queued: RTCIceCandidate[] = [];
  let closed = false;

  const dataChannel = pc.createDataChannel("parameters", { ordered: true });

  pc.oniceconnectionstatechange = () => diag("webrtc", `ICE: ${pc.iceConnectionState}`);
  pc.onconnectionstatechange = () =>
    diag(
      "webrtc",
      `conexiune: ${pc.connectionState}`,
      pc.connectionState === "failed" ? "error" : "info",
    );

  const sendCandidate = async (candidate: RTCIceCandidate) => {
    if (!sessionId || closed) return;
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

  const cleanup = () => {
    if (closed) return;
    closed = true;
    activeSessions = Math.max(0, activeSessions - 1);
    const closingSessionId = sessionId;
    sessionId = null;
    if (closingSessionId) {
      void call(`/api/v1/webrtc/offer/${closingSessionId}`, "DELETE");
    }
    try {
      dataChannel.close();
    } catch {
      /* ignore */
    }
    pc.close();
  };

  const fail = (message: string): never => {
    cleanup();
    diag("session", message, "error");
    throw new Error(message);
  };

  const processed = new Promise<MediaStream>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Pista video procesată nu a sosit (30 s)")), 30_000);
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        clearTimeout(t);
        resolve(stream);
      }
    };
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed") {
        clearTimeout(t);
        reject(new Error("Conexiunea WebRTC cu GPU-ul a eșuat (firewall / TURN)"));
      }
    });
  });

  for (const track of cameraStream.getVideoTracks()) pc.addTrack(track, cameraStream);
  const videoTransceiver = pc.getTransceivers().find((item) => item.sender.track?.kind === "video");
  const vp8 = RTCRtpReceiver.getCapabilities("video")?.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() === "video/vp8",
  );
  if (videoTransceiver && vp8?.length) videoTransceiver.setCodecPreferences(vp8);
  // The outgoing camera transceiver is sendrecv, allowing Scope to attach the
  // processed track to the same negotiated video m-line. Scope's own client
  // forces VP8 here for aiortc compatibility, so mirror that contract.

  onStatus?.("publishing", "conectare video");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  timer.mark("offer");

  const localSdp = pc.localDescription?.sdp;
  if (!localSdp) return fail("Browserul nu a produs o ofertă video");

  const steps = (Array.isArray(settings.scopeDenoiseSteps) ? settings.scopeDenoiseSteps : [])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);

  const answerRes = await call("/api/v1/webrtc/offer", "POST", {
    sdp: localSdp,
    type: pc.localDescription?.type ?? "offer",
    initialParameters: {
      input_mode: "video",
      pipeline_ids: [settings.scopePipeline || "krea-realtime-video"],
      prompts: [{ text: String(settings.prompt || ""), weight: 1 }],
      ...(steps.length ? { denoising_step_list: steps } : {}),
      manage_cache: true,
      produces_video: true,
      produces_audio: false,
      noise_scale: 0.7,
      noise_controller: true,
    },
  });

  const answer = answerRes.body as { sdp?: string; type?: string; sessionId?: string } | null;
  if (!answerRes.ok || !answer?.sdp) {
    const detail = (() => {
      const body = answerRes.body as { detail?: unknown } | string | null;
      if (typeof body === "string") return body.slice(0, 300);
      const d = body && typeof body === "object" ? body.detail : null;
      if (!d) return "";
      return (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 300);
    })();
    return fail(
      `${answerRes.error || `Oferta WebRTC respinsă (${answerRes.status})`}${detail ? ` — ${detail}` : ""}`,
    );
  }
  sessionId = answer.sessionId ?? null;
  await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  await Promise.all(queued.splice(0).map((candidate) => sendCandidate(candidate)));
  timer.mark("answer");

  const processedStream = await processed.catch((error: Error) => fail(error.message));
  timer.mark("track");

  const outputTrack = processedStream.getVideoTracks()[0];
  if (!outputTrack) return fail("GPU-ul nu a trimis o pistă video");

  const transportSnapshot = async () => {
    const stats = await pc.getStats().catch(() => null);
    if (!stats) return "statistici indisponibile";
    let selected = "nicio rută ICE selectată";
    let inbound = "cadre primite: 0";
    const candidates = new Map<string, { candidateType?: string }>();
    stats.forEach((report) => {
      if (report.type === "local-candidate" || report.type === "remote-candidate") {
        candidates.set(report.id, report as RTCStats & { candidateType?: string });
      }
    });
    stats.forEach((report) => {
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        const local = candidates.get(String(report.localCandidateId));
        const remote = candidates.get(String(report.remoteCandidateId));
        const route = `${String(local?.candidateType ?? "?")}→${String(remote?.candidateType ?? "?")}`;
        selected = `rută ICE ${route} ${report.currentRoundTripTime != null ? `${Math.round(Number(report.currentRoundTripTime) * 1000)} ms` : "activă"}`;
      }
      if (report.type === "inbound-rtp" && report.kind === "video") {
        inbound = `cadre primite: ${Number(report.framesDecoded ?? report.framesReceived ?? 0)}`;
      }
    });
    return `${selected}, ${inbound}`;
  };

  if (outputTrack.muted) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("GPU-ul s-a conectat, dar nu a trimis cadre (30 s)")),
        30_000,
      );
      outputTrack.addEventListener(
        "unmute",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    }).catch(async (error: Error) => {
      const snapshot = await transportSnapshot();
      diag("webrtc", snapshot, "error");
      const transportHint = hasTurn
        ? "GPU-ul procesează, dar pista video de retur nu ajunge în browser"
        : "lipsește un releu TURN dedicat pe GPU";
      return fail(`${error.message}; ${transportHint}`);
    });
    timer.mark("unmute");
  }

  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.srcObject = processedStream;
  await probe.play().catch(() => undefined);
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const check = () => {
      if (probe.videoWidth > 0 && probe.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        diag("frames", `primul cadru procesat ${probe.videoWidth}×${probe.videoHeight}`);
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("GPU-ul s-a conectat, dar nu a produs cadre video (30 s)"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  }).catch((error: Error) => {
    probe.srcObject = null;
    return fail(error.message);
  });
  probe.srcObject = null;
  timer.mark("first-frame");

  diag("session", `LIVE în ${timer.total()} ms`);
  onStatus?.("live");

  return {
    streamId: sessionId ?? "scope",
    processedStream,
    playbackUrl: "",
    cameraStream,
    startupMs: timer.total(),
    stop: async () => {
      cleanup();
      diag("session", "sesiune închisă");
      onStatus?.("ended");
    },
  };
}

/**
 * Warm-up verification: opens a short session with a synthetic black canvas
 * stream and confirms the GPU returns a decoded frame. Only after this does
 * the kiosk report READY.
 */
async function probeProcessedFrame(pipeline: string) {
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  let frame = 0;
  const paint = window.setInterval(() => {
    if (!ctx) return;
    frame += 1;
    ctx.fillStyle = `hsl(${frame % 360} 20% 45%)`;
    ctx.fillRect(0, 0, 512, 512);
  }, 66);
  const stream = canvas.captureStream(15);
  try {
    const session = await openSession({
      settings: {
        prompt: "portrait",
        scopeDenoiseSteps: [700, 500],
      } as MirrorSettings,
      cameraStream: stream,
    });
    await session.stop();
    diag("probe", `pipeline ${pipeline} produce cadre reale`);
  } finally {
    window.clearInterval(paint);
    stream.getTracks().forEach((t) => t.stop());
  }
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
  // Reuses the warm pipeline when available; otherwise warms now (shared).
  if (!isScopeReady(settings.scopePipeline)) {
    await prewarmScope(settings.scopePipeline, onStatus);
  }
  return openSession({ settings, cameraStream, onStatus });
}
