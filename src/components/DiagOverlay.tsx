import { useEffect, useState } from "react";
import { clearDiag, subscribeDiag, type DiagEntry } from "@/lib/diag";

/** Verbose, on-screen diagnostics for the live pipeline (diagnose mode). */
export function DiagOverlay({ onClose }: { onClose?: () => void }) {
  const [entries, setEntries] = useState<DiagEntry[]>([]);

  useEffect(() => subscribeDiag(setEntries), []);

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 z-40 max-h-[38vh] w-full overflow-y-auto border-t border-hairline bg-background/92 p-4 font-mono text-[11px] leading-relaxed backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-muted-foreground">
        <span className="tracking-[0.25em] uppercase">Diagnostic</span>
        <span className="flex gap-4">
          <button className="underline underline-offset-4" onClick={() => clearDiag()}>
            golește
          </button>
          {onClose && (
            <button className="underline underline-offset-4" onClick={onClose}>
              ascunde
            </button>
          )}
        </span>
      </div>
      {entries.length === 0 && <p className="text-muted-foreground">fără evenimente încă…</p>}
      {[...entries].reverse().map((e, i) => (
        <p
          key={`${e.at}-${i}`}
          className={
            e.level === "error"
              ? "text-primary"
              : e.level === "warn"
                ? "text-foreground"
                : "text-muted-foreground"
          }
        >
          {new Date(e.at).toLocaleTimeString("ro-RO")} · {e.scope} · {e.message}
        </p>
      ))}
    </div>
  );
}
