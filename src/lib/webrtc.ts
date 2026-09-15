import type { MirrorSettings } from "./settings";

export type StreamSession = {
  streamId: string;
  whipUrl: string;
  whepUrl: string;
};

const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function authHeaders(settings: MirrorSettings): Record<string, string> {
  return settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {};
}

export async function createStream(
  settings: MirrorSettings,
  signal?: AbortSignal,
): Promise<StreamSession> {
  const res = await fetch(`${settings.backendBaseUrl.replace(/\/$/, "")}/v1/streams`, {
    method: "POST",
    signal: signal ?? null,
    headers: { "Content-Type": "application/json", ...authHeaders(settings) },
    body: JSON.stringify({
      pipeline: settings.pipelineId,
      params: {
        prompt: settings.prompt,
        width: settings.width,
        height: settings.height,
        fps: settings.fps,
      },
    }),
  });
  if (!res.ok) throw new Error(`createStream failed: ${res.status}`);
  const data = (await res.json()) as {
    stream_id: string;
    whip_url: string;
    whep_url: string;
  };
  return { streamId: data.stream_id, whipUrl: data.whip_url, whepUrl: data.whep_url };
}

export async function deleteStream(settings: MirrorSettings, streamId: string) {
  try {
    await fetch(
      `${settings.backendBaseUrl.replace(/\/$/, "")}/v1/streams/${encodeURIComponent(streamId)}`,
      { method: "DELETE", headers: authHeaders(settings) },
    );
  } catch {
    /* best effort */
  }
}

async function exchangeSdp(url: string, offer: string, apiKey: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: offer,
  });
  if (!res.ok) throw new Error(`SDP exchange failed: ${res.status}`);
  return res.text();
}

async function waitForIce(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 2000);
  });
}

/** Publish a local MediaStream to a WHIP endpoint. */
export async function whipPublish(
  url: string,
  stream: MediaStream,
  apiKey = "",
): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection(ICE);
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);
  const answer = await exchangeSdp(url, pc.localDescription!.sdp, apiKey);
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  return pc;
}

/** Subscribe to a WHEP endpoint; resolves with the remote MediaStream. */
export async function whepPlay(
  url: string,
  apiKey = "",
): Promise<{ pc: RTCPeerConnection; stream: MediaStream }> {
  const pc = new RTCPeerConnection(ICE);
  pc.addTransceiver("video", { direction: "recvonly" });
  const remote = new MediaStream();
  pc.ontrack = (e) => remote.addTrack(e.track);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);
  const answer = await exchangeSdp(url, pc.localDescription!.sdp, apiKey);
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  return { pc, stream: remote };
}

export async function testConnection(settings: MirrorSettings) {
  const start = performance.now();
  const session = await createStream(settings);
  const latency = Math.round(performance.now() - start);
  await deleteStream(settings, session.streamId);
  return { latency, session };
}
