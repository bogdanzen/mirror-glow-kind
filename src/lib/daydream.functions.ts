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

export type StreamStatusResult = {
  ready: boolean;
  whepUrl?: string;
  inputFps?: number;
  outputFps?: number;
  error?: string;
};

const FALLBACK_PROMPT =
  "photorealistic live portrait of the exact same person, completely bald with a smooth naturally shaved scalp, preserve exact facial identity, eyes, nose, mouth, skin tone, expression, clothing, camera angle, lighting and unchanged background, documentary photography, realistic skin texture";

export const daydreamHealth = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env["DAYDREAM_API_KEY"]) };
});

export const createDaydreamStream = createServerFn({ method: "POST" })
  .validator((input: CreateInput) => input ?? {})
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
            delta: data.delta ?? 0.45,
            guidance_scale: 1.0,
            num_inference_steps: 50,
            t_index_list: (data.steps ?? 2) <= 1 ? [32] : [15, 32],
            use_lcm_lora: true,
            acceleration: "tensorrt",
            use_denoising_batch: true,
            do_add_noise: true,
            enable_similar_image_filter: true,
            similar_image_filter_threshold: 0.98,
            similar_image_filter_max_skip_frame: 4,
            controlnets:
              (data.modelId || "stabilityai/sdxl-turbo") === "stabilityai/sdxl-turbo"
                ? [
                    {
                      enabled: true,
                      model_id: "xinsir/controlnet-depth-sdxl-1.0",
                      preprocessor: "depth_tensorrt",
                      conditioning_scale: 0.45,
                      preprocessor_params: {},
                      control_guidance_start: 0,
                      control_guidance_end: 1,
                    },
                    {
                      enabled: true,
                      model_id: "xinsir/controlnet-canny-sdxl-1.0",
                      preprocessor: "canny",
                      conditioning_scale: 0.12,
                      preprocessor_params: {},
                      control_guidance_start: 0,
                      control_guidance_end: 1,
                    },
                  ]
                : undefined,
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
  .validator((input: { id: string }) => input)
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

export const getDaydreamStreamStatus = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<StreamStatusResult> => {
    const apiKey = process.env["DAYDREAM_API_KEY"];
    if (!apiKey || !data.id) return { ready: false, error: "Stream neconfigurat" };
    try {
      const res = await fetch(`${API_BASE}/v1/streams/${encodeURIComponent(data.id)}/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return { ready: false, error: `Status Daydream ${res.status}` };
      const body = (await res.json()) as {
        data?: {
          inference_status?: {
            input_fps?: number;
            output_fps?: number;
            last_output_time?: number;
            last_error?: string | null;
            last_restart_logs?: string[];
          };
          gateway_status?: {
            whep_url?: string;
            error?: { error_message?: string };
          };
        };
      };
      const inference = body.data?.inference_status;
      const gateway = body.data?.gateway_status;
      const error =
        inference?.last_error ||
        gateway?.error?.error_message ||
        inference?.last_restart_logs?.slice(-1)[0] ||
        undefined;
      return {
        ready: Boolean(inference?.last_output_time || (inference?.output_fps ?? 0) > 0),
        whepUrl: gateway?.whep_url,
        inputFps: inference?.input_fps,
        outputFps: inference?.output_fps,
        error,
      };
    } catch (error) {
      return { ready: false, error: (error as Error).message };
    }
  });
