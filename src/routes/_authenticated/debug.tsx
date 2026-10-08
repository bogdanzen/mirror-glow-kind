import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clearDebugTimings,
  getDebugTimings,
  getKioskStatuses,
  initializeRemoteAdmin,
  sendKioskCommand,
} from "@/lib/kiosk-admin.functions";

export const Route = createFileRoute("/_authenticated/debug")({
  head: () => ({
    meta: [
      { title: "Debug timpi — Oglinda" },
      { name: "description", content: "Timpii de răspuns AI, pașii experienței și latența tabletei." },
      { property: "og:title", content: "Debug timpi — Oglinda" },
      { property: "og:description", content: "Unde întârzie experiența pe tableta reală." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DebugPage,
});

type Row = Awaited<ReturnType<typeof getDebugTimings>>[number];

const KIND_LABEL: Record<string, string> = {
  step: "Pas",
  ai: "AI (tabletă)",
  server_ai: "AI (server)",
  ping: "Ping",
};

function fmt(ms: number | null) {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

function DebugPage() {
  const initialize = useServerFn(initializeRemoteAdmin);
  const load = useServerFn(getDebugTimings);
  const clear = useServerFn(clearDebugTimings);
  const statuses = useServerFn(getKioskStatuses);
  const send = useServerFn(sendKioskCommand);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      await initialize();
      setRows(await load());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nu am putut citi jurnalul");
    }
  }, [initialize, load]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const ping = async () => {
    setError("");
    try {
      const all = await statuses();
      const android = all.filter((r) => /android/i.test(r.user_agent ?? ""));
      const pick = all.find((r) => /iulius/i.test(r.kiosk_name)) ?? android[0] ?? all[0];
      if (!pick) throw new Error("Nicio tabletă înregistrată");
      await send({ data: { kioskId: pick.id, command: "ping" } });
      setMessage(`Ping trimis către „${pick.kiosk_name}”. Rezultatul apare aici în maximum 15 secunde.`);
    } catch (cause) {
      setMessage("");
      setError(cause instanceof Error ? cause.message : "Ping-ul nu a putut fi trimis");
    }
  };

  const wipe = async () => {
    await clear();
    setRows([]);
  };

  const stats = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const r of rows) {
      if (r.ms == null) continue;
      const key = r.kind === "step" && r.label.startsWith("Ecran") ? r.label : `${KIND_LABEL[r.kind] ?? r.kind}: ${r.label}`;
      groups.set(key, [...(groups.get(key) ?? []), r.ms]);
    }
    return [...groups.entries()]
      .map(([label, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          label,
          count: values.length,
          median: sorted[Math.floor(sorted.length / 2)] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
        };
      })
      .sort((a, b) => b.median - a.median);
  }, [rows]);

  const lastPing = rows.find((r) => r.kind === "ping");
  const visible = filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  return (
    <main className="dashboard-scroll h-dvh overflow-y-auto bg-background px-[5vw] py-[5vh] text-foreground">
      <div className="mx-auto max-w-6xl pb-20">
        <header className="flex flex-wrap items-end justify-between gap-6 hairline-b pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Oglinda</p>
            <h1 className="mt-2 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none">Debug timpi</h1>
          </div>
          <div className="flex gap-4 text-sm">
            <Link to="/remote" className="text-primary underline underline-offset-8">Monitorizare</Link>
            <Link to="/dashboard" className="text-primary underline underline-offset-8">Statistici</Link>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => void ping()}>Ping tabletă</Button>
          <Button variant="outline" onClick={() => void refresh()}>Reîncarcă</Button>
          <Button variant="outline" onClick={() => void wipe()}>Golește jurnalul</Button>
          {lastPing && (
            <span className="text-sm text-muted-foreground">
              Ultimul ping: <strong className="text-foreground">{fmt(lastPing.ms)}</strong> (median) ·{" "}
              {new Date(lastPing.created_at).toLocaleTimeString("ro-RO")} · {lastPing.meta}
            </span>
          )}
        </div>
        {message && <p className="mt-5 border border-primary p-4 text-sm text-primary">{message}</p>}
        {error && <p className="mt-5 border border-destructive p-4 text-sm text-destructive">{error}</p>}

        <h2 className="mt-10 font-display text-2xl">Rezumat (cele mai lente primele)</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr><th className="py-2">Pas</th><th>Număr</th><th>Median</th><th>Maxim</th></tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.label} className="border-t border-hairline">
                <td className="py-2 pr-4">{s.label}</td><td>{s.count}</td><td>{fmt(s.median)}</td><td>{fmt(s.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          <h2 className="mr-4 font-display text-2xl">Jurnal</h2>
          {["all", "step", "ai", "server_ai", "ping"].map((k) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
              {k === "all" ? "Toate" : KIND_LABEL[k]}
            </Button>
          ))}
        </div>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr><th className="py-2">Ora</th><th>Tip</th><th>Eveniment</th><th>Durată</th><th>Detalii</th></tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-hairline align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString("ro-RO")}</td>
                <td className="pr-3">{KIND_LABEL[r.kind] ?? r.kind}</td>
                <td className="pr-3">{r.label}</td>
                <td className="pr-3 whitespace-nowrap">{fmt(r.ms)}</td>
                <td className="break-all text-xs text-muted-foreground">{r.meta === "{}" ? "" : r.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="mt-6 text-muted-foreground">Încă nu există înregistrări.</p>}
      </div>
    </main>
  );
}
