import { createFileRoute } from "@tanstack/react-router";
import { MirrorV4 } from "@/components/MirrorV4";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Afacad:wght@400&family=Bebas+Neue&family=Bodoni+Moda:wght@700&family=Roboto+Condensed:wght@400&family=Tinos:wght@400;700&display=swap" }],
    meta: [
      { title: "Oglinda — Vertical Freedom" },
      {
        name: "description",
        content: "O experiență interactivă despre prevenție, alegere și grijă față de tine.",
      },
      { property: "og:title", content: "Oglinda — Vertical Freedom" },
      {
        property: "og:description",
        content: "Privește-te în oglindă și alege prevenția înainte să doară.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MirrorV4,
});