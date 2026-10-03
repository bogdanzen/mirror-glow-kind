import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Autentificare administrare — Oglinda" },
      { name: "description", content: "Acces securizat la monitorizarea și controlul oglinzii." },
      { property: "og:title", content: "Autentificare administrare — Oglinda" },
      { property: "og:description", content: "Acces securizat la monitorizarea oglinzii." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/remote" });
    });
  }, [navigate]);

  const signIn = async () => {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) setError(result.error.message);
  };

  return (
    <main className="min-h-dvh overflow-y-auto bg-background px-6 py-16 text-foreground">
      <section className="mx-auto max-w-md border border-hairline p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Oglinda</p>
        <h1 className="mt-4 font-display text-5xl leading-none">Administrare remote</h1>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Intră cu contul de administrator pentru starea tabletei și comenzile de la distanță.
        </p>
        <Button onClick={() => void signIn()} className="mt-8 w-full rounded-none py-6">
          Continuă cu Google
        </Button>
        {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}