import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_SUFFIX = ".livepeer.com";

function readUpstream(request: Request): URL | null {
  const encoded = new URL(request.url).searchParams.get("url");
  if (!encoded) return null;

  try {
    const upstream = new URL(encoded);
    const allowedHost =
      upstream.hostname === "livepeer.com" || upstream.hostname.endsWith(ALLOWED_HOST_SUFFIX);
    if (!['https:', 'http:'].includes(upstream.protocol) || !allowedHost) return null;
    return upstream;
  } catch {
    return null;
  }
}

async function forward(request: Request, method: "POST" | "DELETE") {
  const upstream = readUpstream(request);
  if (!upstream) return new Response("Invalid playback endpoint", { status: 400 });

  const response =
    method === "POST"
      ? await fetch(upstream, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: await request.text(),
        })
      : await fetch(upstream, { method: "DELETE" });

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const location = response.headers.get("location");
  if (location) {
    const resource = new URL(location, upstream).toString();
    headers.set(
      "location",
      new URL(
        `/api/public/daydream-whep?url=${encodeURIComponent(resource)}`,
        request.url,
      ).toString(),
    );
  }


  const playbackUrl = response.headers.get("livepeer-playback-url");
  if (playbackUrl) {
    headers.set(
      "livepeer-playback-url",
      new URL(
        `/api/public/daydream-whep?url=${encodeURIComponent(playbackUrl)}`,
        request.url,
      ).toString(),
    );
  }

  return new Response(response.body, { status: response.status, headers });
}

export const Route = createFileRoute("/api/public/daydream-whep")({
  server: {
    handlers: {
      POST: ({ request }) => forward(request, "POST"),
      DELETE: ({ request }) => forward(request, "DELETE"),
    },
  },
});