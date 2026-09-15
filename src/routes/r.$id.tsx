import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCapture } from "@/lib/captures";

export const Route = createFileRoute("/r/$id")({
  head: () => ({
    meta: [
      { title: "Imaginea ta — Oglinda" },
      {
        name: "description",
        content: "Descarcă imaginea din instalația Oglinda. Se șterge automat după 24 de ore.",
      },
      { property: "og:title", content: "Imaginea ta — Oglinda" },
      {
        property: "og:description",
        content: "Descarcă imaginea din instalația Oglinda. Se șterge automat după 24 de ore.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Result,
});

function Result() {
  const { id } = useParams({ from: "/r/$id" });
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDataUrl(getCapture(id)?.dataUrl ?? null);
    setReady(true);
  }, [id]);

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-10 bg-background px-[8vw] text-center text-foreground">
      {!ready ? null : dataUrl ? (
        <>
          <img src={dataUrl} alt="Imaginea ta" className="max-h-[60vh] object-contain" />
          <a
            href={dataUrl}
            download={`oglinda-${id}.jpg`}
            className="w-full max-w-md hairline-t hairline-b py-6 text-2xl text-primary"
          >
            Descarcă imaginea
          </a>
          <p className="text-sm text-muted-foreground">
            Imaginea se șterge automat după 24 de ore.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl">Imaginea nu mai este disponibilă.</h1>
          <p className="text-muted-foreground">
            Link-urile expiră după 24 de ore, iar imaginea este ștearsă automat.
          </p>
        </>
      )}
      <Link to="/" className="text-muted-foreground underline underline-offset-8">
        Înapoi
      </Link>
    </main>
  );
}
