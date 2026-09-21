import { createFileRoute } from "@tanstack/react-router";

/**
 * Server side of the pluggable mirror. Holds the third-party keys
 * (FAL_KEY, PERFECTCORP_KEY) so they never reach the browser, forwards one
 * frame and returns the processed image. Nothing is stored.
 */

type Body = {
  provider?: string;
  image?: string;
  prompt?: string;
  negative_prompt?: string;
  denoise?: number;
  seed?: number;
  size?: number;
  premium?: boolean;
};

const FAL_HAIR_ENDPOINT = "fal-ai/image-apps-v2/hair-change";

async function falHair(body: Body, key: string): Promise<Response> {
  const imageUrl = `data:image/jpeg;base64,${body.image ?? ""}`;
  const submit = await fetch(`https://queue.fal.run/${FAL_HAIR_ENDPOINT}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      hair_style: "bald",
      prompt: body.prompt || "completely bald smooth scalp, no hair, no eyebrows",
      ...(body.seed ? { seed: body.seed } : {}),
    }),
  });
  const submitted = (await submit.json().catch(() => ({}))) as {
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!submit.ok || !submitted.status_url) {
    return new Response(
      `fal.ai ${submit.status}: ${JSON.stringify(submitted.detail ?? submitted).slice(0, 200)}`,
      { status: submit.status || 502 },
    );
  }

  // Poll until the queue finishes. No artificial deadline beyond the client's.
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await fetch(submitted.status_url, {
      headers: { Authorization: `Key ${key}` },
    });
    const state = (await status.json().catch(() => ({}))) as { status?: string };
    if (state.status === "COMPLETED") break;
    if (state.status === "FAILED") return new Response("fal.ai: procesare eșuată", { status: 502 });
  }

  const result = await fetch(submitted.response_url ?? submitted.status_url, {
    headers: { Authorization: `Key ${key}` },
  });
  const json = (await result.json().catch(() => ({}))) as {
    image?: { url?: string };
    images?: { url?: string }[];
  };
  const url = json.image?.url ?? json.images?.[0]?.url;
  if (!url) return new Response("fal.ai nu a returnat imagine", { status: 502 });
  return Response.json({ url });
}

async function perfectcorp(body: Body, key: string): Promise<Response> {
  // YouCam AI Hairstyle, style "bald". One-shot, high quality.
  const res = await fetch("https://yce-api-01.perfectcorp.com/s2s/v1.1/task/ai-hairstyle", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: Date.now(),
      payload: {
        file_base64: body.image ?? "",
        style: "bald",
        ...(body.size ? { output_size: body.size } : {}),
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    result?: { url?: string; image?: string };
    error?: unknown;
  };
  if (!res.ok) {
    return new Response(`PerfectCorp ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 200)}`, {
      status: res.status,
    });
  }
  if (json.result?.url) return Response.json({ url: json.result.url });
  if (json.result?.image) return Response.json({ image: json.result.image });
  return new Response("PerfectCorp nu a returnat imagine", { status: 502 });
}

export const Route = createFileRoute("/api/mirror-frame")({
  server: {
    handlers: {
      // Reachability probe for the admin test button.
      GET: async ({ request }) => {
        const provider = new URL(request.url).searchParams.get("provider") ?? "";
        const key =
          provider === "perfectcorp" ? process.env["PERFECTCORP_KEY"] : process.env["FAL_KEY"];
        return Response.json({ ok: Boolean(key), provider });
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Body;
        if (!body.image) return new Response("Lipsește imaginea", { status: 400 });

        if (body.provider === "perfectcorp") {
          const key = process.env["PERFECTCORP_KEY"] ?? "";
          if (!key) return new Response("Lipsește cheia PerfectCorp", { status: 400 });
          return perfectcorp(body, key);
        }

        const key = process.env["FAL_KEY"] ?? "";
        if (!key) return new Response("Lipsește cheia fal.ai", { status: 400 });
        return falHair(body, key);
      },
    },
  },
});
