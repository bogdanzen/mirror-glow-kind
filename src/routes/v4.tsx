import { createFileRoute } from "@tanstack/react-router";
import { MirrorV4 } from "@/components/MirrorV4";

export const Route = createFileRoute("/v4")({
  head: () => ({
    meta: [
      { title: "Te vezi? — Oglinda V4" },
      { name: "description", content: "Previzualizarea noului design al campaniei „TE VEZI?” a Fundației Vertical Freedom." },
      { property: "og:title", content: "Te vezi? — Oglinda V4" },
      { property: "og:description", content: "Trăiește-ți viața acum. Prevenția începe înainte să doară." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MirrorV4,
});
