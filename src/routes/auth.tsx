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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/remote" });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/remote" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const signIn = async () => {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
    });
    if (result.error) setError(result.error.message);
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth`, shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <main className="min-h-dvh overflow-y-auto bg-background px-6 py-16 text-foreground">
      <section className="mx-auto max-w-md border border-hairline p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Oglinda</p>
        <h1 className="mt-4 font-display text-5xl leading-none">Administrare remote</h1>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Intră sau creează-ți cont de administrator cu un link primit pe email.
        </p>
        {sent ? (
          <p className="mt-8 border border-primary p-4 text-sm text-primary">
            Ți-am trimis un link pe {email}. Deschide-l pe acest dispozitiv pentru a intra.
          </p>
        ) : (
          <form onSubmit={(e) => void sendLink(e)} className="mt-8 grid gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplu.ro"
              className="w-full border border-hairline bg-transparent px-4 py-3 text-base outline-none focus:border-primary"
            />
            <Button type="submit" disabled={busy} className="w-full rounded-none py-6">
              {busy ? "Se trimite…" : "Trimite link de autentificare"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">sau</p>
        <Button onClick={() => void signIn()} variant="outline" className="mt-4 w-full rounded-none py-6">
          Continuă cu Google
        </Button>
        {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}