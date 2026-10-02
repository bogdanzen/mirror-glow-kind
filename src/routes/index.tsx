import { createFileRoute } from "@tanstack/react-router";
import { MirrorV2 } from "@/components/MirrorV2";

export const Route = createFileRoute("/")({
  head: () => ({
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
  component: MirrorV2,
});