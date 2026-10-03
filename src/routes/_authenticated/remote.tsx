import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getKioskStatuses,
  initializeRemoteAdmin,
  sendKioskCommand,
} from "@/lib/kiosk-admin.functions";

export const Route = createFileRoute("/_authenticated/remote")({
  head: () => ({
    meta: [
      { title: "Monitorizare live — Oglinda" },
      { name: "description", content: "Starea tehnică și controlul de la distanță al oglinzii." },
      { property: "og:title", content: "Monitorizare live — Oglinda" },
      { property: "og:description", content: "Starea tehnică a tabletei, camerei și conexiunii AI." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RemoteControl,
});

type KioskStatus = Awaited<ReturnType<typeof getKioskStatuses>>[number];

const SCREEN_LABELS: Record<string, string> = {
  attract: "Ecran de început",
  consent: "Consimțământ",
  framing: "Numărătoare",
  mirror: "Portret cu chelie",
  choice: "Portret cu zâmbet",
  healthy: "Mesaj de prevenție",
  final: "Ecran final",
  donate: "Donație",
};

function ago(value: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `acum ${seconds}s`;
  return `acum ${Math.floor(seconds / 60)} min`;
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-destructive"}`} />;
}

function RemoteControl() {
  const initialize = useServerFn(initializeRemoteAdmin);
  const getStatuses = useServerFn(getKioskStatuses);
  const sendCommand = useServerFn(sendKioskCommand);
  const [rows, setRows] = useState<KioskStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      await initialize();
      const all = await getStatuses();
      // Only the Iulius Android tablet: prefer a name with "iulius", else the newest Android device.
      const android = all.filter((r) => /android/i.test(r.user_agent ?? ""));
      const pick = all.find((r) => /iulius/i.test(r.kiosk_name)) ?? android[0];
      setRows(pick ? [pick] : []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Monitorizarea nu este disponibilă");
    } finally {
      setLoading(false);
    }
  }, [getStatuses, initialize]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, 5000);
    const channel = supabase
      .channel("remote-kiosk-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "kiosk_status" }, () => void load())
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const command = async (kioskId: string, value: "refresh" | "reset_experience") => {
    setMessage("Trimit comanda…");
    setError("");
    try {
      await sendCommand({ data: { kioskId, command: value } });
      setMessage(value === "refresh" ? "Refresh trimis. Tableta îl preia în maximum 10 secunde." : "Reset trimis.");
    } catch (cause) {
      setMessage("");
      setError(cause instanceof Error ? cause.message : "Comanda nu a putut fi trimisă");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  };

  return (
    <main className="dashboard-scroll h-dvh overflow-y-auto bg-background px-[5vw] py-[5vh] text-foreground">
      <div className="mx-auto max-w-6xl pb-20">
        <header className="flex flex-wrap items-end justify-between gap-6 hairline-b pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Oglinda</p>
            <h1 className="mt-2 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Monitorizare live</h1>
          </div>
          <div className="flex gap-4 text-sm">
            <Link to="/dashboard" className="text-primary underline underline-offset-8">Statistici</Link>
            <button onClick={() => void signOut()} className="text-muted-foreground underline underline-offset-8">Ieși</button>
          </div>
        </header>

        <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
          Stare tehnică în timp real, fără transmiterea sau salvarea imaginilor persoanelor din mall.
        </p>
        {message && <p className="mt-5 border border-primary p-4 text-sm text-primary">{message}</p>}
        {error && <p className="mt-5 border border-destructive p-4 text-sm text-destructive">{error}</p>}
        {loading && <p className="mt-10 text-muted-foreground">Se conectează la oglindă…</p>}
        {!loading && rows.length === 0 && (
          <p className="mt-10 border border-hairline p-6 text-muted-foreground">
            Tableta nu s-a înregistrat încă. Va apărea aici automat după ce deschide pagina principală.
          </p>
        )}

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          {rows.map((row) => {
            const online = now - new Date(row.last_seen).getTime() < 30_000;
            return (
              <article key={row.id} className="border border-hairline p-6">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Totem</p>
                    <h2 className="mt-2 text-2xl">{row.kiosk_name}</h2>
                  </div>
                  <p className={`flex items-center gap-2 text-sm ${online ? "text-emerald-400" : "text-destructive"}`}>
                    <Dot ok={online} /> {online ? "Online" : "Offline"}
                  </p>
                </div>

                <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                  <div><dt className="text-muted-foreground">Ultimul semnal</dt><dd className="mt-1">{ago(row.last_seen, now)}</dd></div>
                  <div><dt className="text-muted-foreground">Ecran curent</dt><dd className="mt-1">{SCREEN_LABELS[row.current_screen] ?? row.current_screen}</dd></div>
                  <div><dt className="text-muted-foreground">Cameră</dt><dd className="mt-1 flex items-center gap-2"><Dot ok={row.camera_ok} />{row.camera_ok ? "Conectată" : "Indisponibilă"}</dd></div>
                  <div><dt className="text-muted-foreground">Conexiune AI</dt><dd className="mt-1 flex items-center gap-2"><Dot ok={row.ai_ok} />{row.ai_ok ? "Disponibilă" : "Neverificată / eroare"}</dd></div>
                  <div><dt className="text-muted-foreground">Răspuns AI</dt><dd className="mt-1">{row.ai_latency_ms ? `${(row.ai_latency_ms / 1000).toFixed(1)}s` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Experiență</dt><dd className="mt-1">{row.session_active ? "Vizitator activ" : "În așteptare"}</dd></div>
                  <div><dt className="text-muted-foreground">Ecran complet</dt><dd className="mt-1 flex items-center gap-2">{(() => {
                    const mode = row.viewport?.split("|")[2];
                    if (!mode) return "Necunoscut (tableta are versiune veche)";
                    const full = mode === "fullscreen" || mode === "app";
                    return <><Dot ok={full} />{full ? "Da, fullscreen" : "Nu — bara browserului e vizibilă"}</>;
                  })()}</dd></div>
                  <div><dt className="text-muted-foreground">Ecran tabletă</dt><dd className="mt-1">{row.viewport?.split("|").slice(0, 2).join(" · ") || "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Dispozitiv</dt><dd className="mt-1 break-words text-xs">{row.user_agent || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Versiune</dt><dd className="mt-1">{row.app_version}</dd></div>
                </dl>

                {row.last_error && <p className="mt-5 border-l-2 border-destructive pl-4 text-sm text-destructive">{row.last_error}</p>}
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button onClick={() => void command(row.id, "refresh")} disabled={!online} className="rounded-none">Forțează refresh</Button>
                  <Button onClick={() => void command(row.id, "reset_experience")} disabled={!online} variant="outline" className="rounded-none">Revino la început</Button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}