import { createServerFn } from "@tanstack/react-start";

const API_BASE = "https://api.daydream.live";

export const DEFAULT_NEGATIVE_PROMPT = "blurry, distorted face, cartoon, wig, hat";

type CreateInput = {
  prompt?: string;
  modelId?: string;
  width?: number;
  height?: number;
  delta?: number;
  seed?: number;
  steps?: number;
};

export type CreateStreamResult =
  | { ok: true; id: string; whipUrl: string; playbackUrl: string }
  | { ok: false; status: number; message: string };

const FALLBACK_PROMPT =
  "photorealistic portrait of the same person with a completely shaved head, chemotherapy patient, natural skin, identical face, same lighting, same background";

export const daydreamHealth = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env["DAYDREAM_API_KEY"]) };
});

export const createDaydreamStream = createServerFn({ method: "POST" })
  .inputValidator((input: CreateInput) => input ?? {})
  .handler(async ({ data }): Promise<CreateStreamResult> => {
    const apiKey = process.env["DAYDREAM_API_KEY"];
    if (!apiKey) return { ok: false, status: 0, message: "DAYDREAM_API_KEY nu este configurat" };

    try {
      const res = await fetch(`${API_BASE}/v1/streams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          pipeline: "streamdiffusion",
          params: {
            model_id: data.modelId || "stabilityai/sdxl-turbo",
            prompt: data.prompt || FALLBACK_PROMPT,
            negative_prompt: DEFAULT_NEGATIVE_PROMPT,
            width: data.width ?? 512,
            height: data.height ?? 512,
            delta: data.delta ?? 0.55,
            guidance_scale: 1.0,
            num_inference_steps: data.steps ?? 2,
            seed: data.seed ?? 42,
          },
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        return { ok: false, status: res.status, message: text.slice(0, 300) || res.statusText };
      }

      const payload = JSON.parse(text) as {
        id?: string;
        stream_id?: string;
        whip_url?: string;
        output_playback_id?: string;
      };
      const whipUrl = payload.whip_url ?? "";
      if (!whipUrl) return { ok: false, status: 502, message: "Răspuns fără whip_url" };

      return {
        ok: true,
        id: payload.id ?? payload.stream_id ?? "",
        whipUrl,
        playbackUrl: payload.output_playback_id
          ? `https://lvpr.tv/?v=${payload.output_playback_id}`
          : "",
      };
    } catch (error) {
      return { ok: false, status: 0, message: (error as Error).message };
    }
  });

export const deleteDaydreamStream = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env["DAYDREAM_API_KEY"];
    if (!apiKey || !data.id) return { ok: false };
    try {
      const res = await fetch(`${API_BASE}/v1/streams/${encodeURIComponent(data.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      // Some deployments have no delete endpoint; the stream then idle-times out.
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  });
