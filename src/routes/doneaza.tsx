import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { track } from "@/lib/metrics";

export const Route = createFileRoute("/doneaza")({
  head: () => ({
    meta: [
      { title: "Donează — Vertical Freedom" },
      { name: "description", content: "Susține prevenția cancerului cu o donație către Vertical Freedom." },
      { property: "og:title", content: "Donează — Vertical Freedom" },
      { property: "og:description", content: "Susține prevenția cancerului cu o donație." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Doneaza,
});

const FALLBACK = "https://verticalfreedom.org/doneaza";

function safeUrl(raw: string | null): string {
  try {
    const u = new URL(raw || FALLBACK);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function Doneaza() {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const target = safeUrl(p.get("d"));
    track("donate_click", {
      sessionId: p.get("s") || undefined,
      kiosk: p.get("k") || undefined,
      device: "phone",
    });
    const id = window.setTimeout(() => window.location.replace(target), 400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center text-foreground">
      <p className="text-xs uppercase tracking-[0.35em] text-primary">Vertical Freedom</p>
      <h1 className="mt-4 font-display text-5xl">Mulțumim.</h1>
      <p className="mt-4 text-muted-foreground">Te ducem la pagina de donații…</p>
    </main>
  );
}
