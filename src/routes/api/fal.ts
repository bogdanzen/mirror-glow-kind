import { createFileRoute } from "@tanstack/react-router";

/**
 * Alternative fallback backend: a fast diffusion model hosted on fal.ai.
 * The key comes either from the kiosk control panel or from a FAL_KEY secret.
 * The uploaded frame is forwarded and discarded, never stored.
 */
export const Route = createFileRoute("/api/fal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const key = String(form.get("key") ?? "") || process.env["FAL_KEY"] || "";
        if (!key) return new Response("Lipsește cheia fal.ai", { status: 400 });

        const image = form.get("image");
        if (!(image instanceof File)) return new Response("Lipsește imaginea", { status: 400 });

        const model = String(form.get("model") ?? "fal-ai/fast-lcm-diffusion/image-to-image");
        const prompt = String(form.get("prompt") ?? "");
        const strength = Number(form.get("strength") ?? 0.45);
        const steps = Number(form.get("steps") ?? 6);

        const bytes = new Uint8Array(await image.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const imageUrl = `data:${image.type || "image/jpeg"};base64,${btoa(binary)}`;

        const upstream = await fetch(`https://fal.run/${model}`, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            image_url: imageUrl,
            strength: Number.isFinite(strength) ? strength : 0.45,
            num_inference_steps: Number.isFinite(steps) ? steps : 6,
            num_images: 1,
            sync_mode: true,
            enable_safety_checker: false,
          }),
        });

        const text = await upstream.text();
        if (!upstream.ok) return new Response(text.slice(0, 500), { status: upstream.status });

        let url = "";
        try {
          const json = JSON.parse(text) as { images?: { url?: string }[] };
          url = json.images?.[0]?.url ?? "";
        } catch {
          /* fall through */
        }
        if (!url) return new Response("fal.ai nu a returnat imagine", { status: 502 });
        return Response.json({ url });
      },
    },
  },
});
