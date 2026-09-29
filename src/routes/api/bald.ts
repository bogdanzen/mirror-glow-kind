import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side fallback for the mirror: when no GPU pipeline is available,
 * a single frame of the visitor is re-rendered as a photorealistic
 * chemotherapy portrait (no hair, no eyebrows) by the Lovable AI image model.
 * The upload is never stored — it is forwarded and discarded.
 */
export const Route = createFileRoute("/api/bald")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const form = await request.formData();
        const streaming = form.get("stream") !== "false";
        const allowed = ["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst"];
        const asked = String(form.get("model") ?? "");
        form.set("model", allowed.includes(asked) ? asked : "openai/gpt-image-2.5-flare");
        form.set("size", "auto");
        if (!form.get("quality")) form.set("quality", "high");
        if (streaming) {
          form.set("stream", "true");
          form.set("partial_images", "2");
        } else {
          form.delete("stream");
          form.delete("partial_images");
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        if (!streaming) {
          return new Response(upstream.body, { headers: { "Content-Type": "application/json" } });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
