import { createFileRoute } from "@tanstack/react-router";
import { MirrorV2 } from "@/components/MirrorV2";

export const Route = createFileRoute("/v2")({
  head: () => ({
    meta: [
      { title: "Oglinda V2 — Vertical Freedom" },
      {
        name: "description",
        content: "Experiența Oglinda, optimizată pentru tablete Android și campania Vertical Freedom.",
      },
      { property: "og:title", content: "Oglinda V2 — Vertical Freedom" },
      {
        property: "og:description",
        content: "O experiență interactivă despre prevenție, alegere și grijă față de tine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MirrorV2,
});