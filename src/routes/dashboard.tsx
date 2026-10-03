import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  EVENT_LABELS,
  fetchEvents,
  summarize,
  type MirrorEventRow,
  type Totals,
} from "@/lib/metrics";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Statistici — Oglinda" },
      {
        name: "description",
        content:
          "Cifrele campaniei Oglinda: câți oameni s-au oprit în fața totemului, câți au scanat codul QR și câți au ales să doneze.",
      },
      { property: "og:title", content: "Statistici — Oglinda" },
      {
        property: "og:description",
        content: "Câți oameni s-au oprit, au scanat codul QR și au donat.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const RANGES = [
  { id: "today", label: "Azi" },
  { id: "7", label: "7 zile" },
  { id: "30", label: "30 zile" },
  { id: "all", label: "Total" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function since(range: RangeId): string | null {
  if (range === "all") return null;
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
}

const button =
  "border border-hairline px-6 py-3 text-sm uppercase tracking-[0.2em] transition-colors hover:border-primary hover:text-primary";

function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function Card({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="border border-hairline p-6">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{title}</p>
      <p className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] leading-none">{value}</p>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

function Dashboard() {
  const [range, setRange] = useState<RangeId>("7");
  const [rows, setRows] = useState<MirrorEventRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (id: RangeId) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchEvents(since(id));
      setRows(data);
      setTotals(summarize(data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  return (
    <main className="dashboard-scroll h-dvh overflow-y-auto bg-background px-[6vw] py-[6vh] text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-6 hairline-b pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-primary">Oglinda</p>
            <h1 className="mt-2 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none">
              Statistici
            </h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground underline underline-offset-8">
            Înapoi la totem
          </Link>
        </header>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`${button} ${range === r.id ? "border-primary text-primary" : "text-muted-foreground"}`}
            >
              {r.label}
            </button>
          ))}
          <button onClick={() => void load(range)} className={`${button} text-foreground`}>
            Reîmprospătează
          </button>
          {loading && <span className="text-sm text-muted-foreground">Se încarcă…</span>}
        </div>

        {error && (
          <p className="mt-8 border border-primary/50 p-4 text-sm text-primary">{error}</p>
        )}

        {totals && (
          <>
            <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                title="În fața oglinzii"
                value={String(totals.sessions)}
                note="persoane care au început experiența"
              />
              <Card
                title="Au scanat codul QR"
                value={String(totals.qrScans)}
                note={`${percent(totals.qrScans, totals.sessions)} din vizitatori`}
              />
              <Card
                title="Au apăsat „Donează”"
                value={String(totals.donations)}
                note={`${percent(totals.donations, totals.qrScans)} din cei care au scanat`}
              />
              <Card
                title="Au renunțat pe parcurs"
                value={String(totals.abandoned)}
                note={`${percent(totals.abandoned, totals.sessions)} nu au ajuns la final`}
              />
            </section>

            <section className="mt-14">
              <h2 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Parcurs pas cu pas
              </h2>
              <div className="mt-6 space-y-3">
                {totals.dropPerStep.map((step) => (
                  <div key={step.step} className="border border-hairline p-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-lg">{step.label}</span>
                      <span className="font-display text-2xl">{step.reached}</span>
                    </div>
                    <div className="mt-3 h-1 w-full bg-hairline">
                      <div
                        className="h-1 bg-primary"
                        style={{
                          width: totals.sessions
                            ? `${Math.min(100, (step.reached / totals.sessions) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {percent(step.reached, totals.sessions)} din vizitatori
                      {step.lost > 0 && ` · ${step.lost} au plecat aici`}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-14">
              <h2 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Pe totemuri
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {totals.kiosks.length === 0 && (
                  <p className="text-muted-foreground">Nicio sesiune înregistrată încă.</p>
                )}
                {totals.kiosks.map((k) => (
                  <Card key={k.name} title={k.name} value={String(k.sessions)} note="sesiuni" />
                ))}
              </div>
            </section>

            <p className="mt-14 text-sm text-muted-foreground">
              {rows.length} evenimente anonime în perioada selectată. Nu se salvează imagini,
              nume sau alte date care să identifice o persoană. Ultimul eveniment:{" "}
              {rows[0] ? new Date(rows[0].created_at).toLocaleString("ro-RO") : "—"}.{" "}
              {EVENT_LABELS.donate_click} se numără la plecarea spre platforma de donații.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
