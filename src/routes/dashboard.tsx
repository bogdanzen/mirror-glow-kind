import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  dailySeries,
  donationsByKiosk,
  hourlyStarts,
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
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => dailySeries(rows), [rows]);
  const hours = useMemo(() => hourlyStarts(rows), [rows]);
  const perKiosk = useMemo(() => donationsByKiosk(rows), [rows]);
  const chartDays = days.map((d) => ({
    ...d,
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" }),
    conversie: d.sessions ? Math.round((d.donations / d.sessions) * 1000) / 10 : 0,
    finalizare: d.sessions ? Math.round((d.final / d.sessions) * 1000) / 10 : 0,
  }));
  const best = days.reduce<typeof days[number] | null>((b, d) => (!b || d.sessions > b.sessions ? d : b), null);
  const activeDays = days.filter((d) => d.sessions > 0).length;
  const peak = hours.reduce((b, h) => (h.sessions > b.sessions ? h : b), hours[0]);

  const exportPdf = async () => {
    const node = reportRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const bg = getComputedStyle(document.body).backgroundColor;
      const canvas = await html2canvas(node, { backgroundColor: bg, scale: 2, windowWidth: 1100 });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgW = pageW - margin * 2;
      const pxPerMm = canvas.width / imgW;
      const sliceH = Math.floor((pageH - margin * 2) * pxPerMm);
      for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
        const part = document.createElement("canvas");
        part.width = canvas.width;
        part.height = Math.min(sliceH, canvas.height - y);
        const ctx = part.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, part.width, part.height);
        ctx.drawImage(canvas, 0, y, part.width, part.height, 0, 0, part.width, part.height);
        if (page > 0) pdf.addPage();
        const px = ctx.getImageData(0, 0, 1, 1).data;
        pdf.setFillColor(px[0], px[1], px[2]);
        pdf.rect(0, 0, pageW, pageH, "F");
        pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, part.height / pxPerMm);
      }
      const label = RANGES.find((r) => r.id === range)?.label ?? range;
      pdf.save(`raport-oglinda-${label.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(`Exportul PDF a eșuat: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

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
          <button onClick={() => void exportPdf()} disabled={exporting || !totals} className={`${button} border-primary text-primary`}>
            {exporting ? "Se generează PDF…" : "Export raport PDF"}
          </button>
          {loading && <span className="text-sm text-muted-foreground">Se încarcă…</span>}
        </div>

        {error && (
          <p className="mt-8 border border-primary/50 p-4 text-sm text-primary">{error}</p>
        )}

        {totals && (
          <div ref={reportRef} className="bg-background pb-6">
            <div className="mt-10">
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Raport campanie · {RANGES.find((r) => r.id === range)?.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generat {new Date().toLocaleString("ro-RO")}
                {days.length > 0 && ` · ${new Date(`${days[0].day}T12:00:00`).toLocaleDateString("ro-RO")} – ${new Date(`${days[days.length - 1].day}T12:00:00`).toLocaleDateString("ro-RO")}`}
              </p>
            </div>
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

            <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Medie pe zi" value={activeDays ? (totals.sessions / activeDays).toFixed(1) : "0"} note={`vizitatori în ${activeDays} zile active`} />
              <Card title="Ziua cea mai bună" value={best ? String(best.sessions) : "—"} note={best ? new Date(`${best.day}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }) : ""} />
              <Card title="Ora de vârf" value={peak?.sessions ? `${peak.hour}:00` : "—"} note={peak?.sessions ? `${peak.sessions} vizitatori în acest interval` : ""} />
              <Card title="Rată finalizare" value={percent(totals.steps.final, totals.sessions)} note={`donații / vizitatori: ${percent(totals.donations, totals.sessions)}`} />
            </section>

            <section className="mt-14">
              <h2 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Evoluție zilnică</h2>
              <div className="mt-6 h-72 border border-hairline p-4 text-primary">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDays}>
                    <CartesianGrid strokeOpacity={0.15} stroke="currentColor" />
                    <XAxis dataKey="label" stroke="currentColor" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="currentColor" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sessions" name="Vizitatori" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="final" name="Au ajuns la final" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="donations" name="Au apăsat Donează" stroke="currentColor" strokeDasharray="5 4" strokeWidth={2} dot isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="h-64 border border-hairline p-4 text-primary">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Rată finalizare și donare pe zi (%)</p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart data={chartDays}>
                      <CartesianGrid strokeOpacity={0.15} stroke="currentColor" />
                      <XAxis dataKey="label" stroke="currentColor" fontSize={11} />
                      <YAxis stroke="currentColor" fontSize={11} unit="%" />
                      <Tooltip />
                      <Bar dataKey="finalizare" name="Finalizare" fill="currentColor" fillOpacity={0.45} isAnimationActive={false} />
                      <Bar dataKey="conversie" name="Donare" fill="currentColor" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-64 border border-hairline p-4 text-primary">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Vizitatori pe ore</p>
                  <ResponsiveContainer width="100%" height="88%">
                    <BarChart data={hours}>
                      <CartesianGrid strokeOpacity={0.15} stroke="currentColor" />
                      <XAxis dataKey="hour" stroke="currentColor" fontSize={11} />
                      <YAxis allowDecimals={false} stroke="currentColor" fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="sessions" name="Vizitatori" fill="currentColor" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="mt-14">
              <h2 className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Tabel pe zile</h2>
              <div className="mt-6 overflow-x-auto border border-hairline">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      {["Zi", "Vizitatori", "Consimțământ", "Portret", "Final", "QR", "Donează", "Conversie"].map((h) => (
                        <th key={h} className="px-3 py-2 font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...days].reverse().map((d) => (
                      <tr key={d.day} className="border-t border-hairline">
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(`${d.day}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "short", day: "2-digit", month: "short" })}</td>
                        <td className="px-3">{d.sessions}</td>
                        <td className="px-3">{d.consent}</td>
                        <td className="px-3">{d.mirror}</td>
                        <td className="px-3">{d.final}</td>
                        <td className="px-3">{d.qrScans}</td>
                        <td className="px-3">{d.donations}</td>
                        <td className="px-3">{percent(d.donations, d.sessions)}</td>
                      </tr>
                    ))}
                    {days.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Nicio activitate în perioada selectată.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                {perKiosk.filter((k) => k.sessions > 0).map((k) => (
                  <Card key={k.name} title={k.name} value={String(k.sessions)} note={`sesiuni · ${k.qrScans} scanări QR · ${k.donations} „Donează” (${percent(k.donations, k.sessions)})`} />
                ))}
              </div>
            </section>

            <p className="mt-14 text-sm text-muted-foreground">
              {rows.length} evenimente anonime în perioada selectată. Nu se salvează imagini,
              nume sau alte date care să identifice o persoană. Ultimul eveniment:{" "}
              {rows[0] ? new Date(rows[0].created_at).toLocaleString("ro-RO") : "—"}.{" "}
              {EVENT_LABELS.donate_click} se numără la plecarea spre platforma de donații.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
