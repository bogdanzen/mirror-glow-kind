import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { donationsByKiosk, fetchEvents, type KioskMoney } from "@/lib/metrics";

export const Route = createFileRoute("/bani")({
  head: () => ({
    meta: [
      { title: "Donații pe totemuri — Oglinda" },
      { name: "description", content: "Câte donații a adus fiecare totem Oglinda, cu estimarea sumelor strânse." },
      { property: "og:title", content: "Donații pe totemuri — Oglinda" },
      { property: "og:description", content: "Donațiile aduse de fiecare totem Oglinda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Bani,
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
  return new Date(Date.now() - Number(range) * 86400000).toISOString();
}

const button =
  "border border-hairline px-6 py-3 text-sm uppercase tracking-[0.2em] transition-colors hover:border-primary hover:text-primary";
const AVG_KEY = "mirror.avgDonation";
const lei = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} lei`;

function Bani() {
  const [range, setRange] = useState<RangeId>("all");
  const [rows, setRows] = useState<KioskMoney[]>([]);
  const [avg, setAvg] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(AVG_KEY));
    if (saved > 0) setAvg(saved);
  }, []);

  const load = useCallback(async (id: RangeId) => {
    setLoading(true);
    setError("");
    try {
      setRows(donationsByKiosk(await fetchEvents(since(id))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const total = rows.reduce((s, r) => s + r.donations, 0);

  return (
    <main className="min-h-dvh bg-background px-[6vw] py-[6vh] text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-6 hairline-b pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-primary">Oglinda</p>
            <h1 className="mt-2 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Donații pe totemuri</h1>
          </div>
          <div className="flex gap-4">
            <Link to="/dashboard" className={button}>Statistici</Link>
            <Link to="/" className={button}>Totem</Link>
          </div>
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
          <button onClick={() => void load(range)} className={button}>Reîmprospătează</button>
          {loading && <span className="text-sm text-muted-foreground">Se încarcă…</span>}
        </div>

        <label className="mt-8 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          Donație medie estimată
          <input
            type="number"
            min={1}
            value={avg}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setAvg(v);
              window.localStorage.setItem(AVG_KEY, String(v));
            }}
            className="w-28 border-b border-hairline bg-transparent py-2 text-lg text-foreground outline-none focus:border-primary"
          />
          lei
        </label>

        {error && <p className="mt-8 border border-primary/50 p-4 text-sm text-primary">{error}</p>}

        <section className="mt-10 border border-primary p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Total estimat</p>
          <p className="mt-4 font-display text-[clamp(3rem,8vw,5.5rem)] leading-none text-primary">{lei(total * avg)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{total} persoane au plecat spre pagina de donații</p>
        </section>

        <section className="mt-10 space-y-3">
          {rows.length === 0 && !loading && <p className="text-muted-foreground">Nicio donație înregistrată încă.</p>}
          {rows.map((k) => (
            <div key={k.name} className="grid grid-cols-2 gap-4 border border-hairline p-5 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Totem</p>
                <p className="mt-2 text-xl">{k.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Vizitatori</p>
                <p className="mt-2 font-display text-3xl">{k.sessions}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Donații</p>
                <p className="mt-2 font-display text-3xl">{k.donations}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Estimat</p>
                <p className="mt-2 font-display text-3xl text-primary">{lei(k.donations * avg)}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="mt-10 text-sm text-muted-foreground">
          Platforma de donații nu ne trimite sumele, așa că numărăm persoanele care au scanat codul „Donează acum” și
          estimăm suma cu donația medie de mai sus.
        </p>
      </div>
    </main>
  );
}
