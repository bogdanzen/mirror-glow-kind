import { createFileRoute } from "@tanstack/react-router";
import { MirrorV3 } from "@/components/MirrorV3";

export const Route = createFileRoute("/v3")({
  head: () => ({
    meta: [
      { title: "Te vezi? — Oglinda Vertical Freedom (V3)" },
      { name: "description", content: "Noua variantă a oglinzii interactive Vertical Freedom despre prevenția cancerului." },
      { property: "og:title", content: "Te vezi? — Oglinda Vertical Freedom" },
      { property: "og:description", content: "Privește-te 5 secunde și alege prevenția înainte să doară." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MirrorV3,
});
