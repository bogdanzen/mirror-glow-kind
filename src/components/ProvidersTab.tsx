import { useEffect, useState } from "react";
import { PROVIDER_IDS, type MirrorSettings } from "@/lib/settings";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/providers/types";
import {
  getProvider,
  runProviderOnce,
  subscribeProviderLog,
  type ProviderLogEntry,
} from "@/lib/providers/registry";
import { sdxlPrompt, SDXL_NEGATIVE_PROMPT } from "@/lib/bald";

const field =
  "w-full bg-transparent border-b border-hairline py-3 text-[--color-foreground] outline-none focus:border-primary text-base";
const label = "block text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1 mt-6";

/** Grabs one real frame from the camera for the test button. */
async function testFrame(size: number): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 600));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const side = Math.min(video.videoWidth || size, video.videoHeight || size);
  ctx?.drawImage(
    video,
    ((video.videoWidth || size) - side) / 2,
    ((video.videoHeight || size) - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  stream.getTracks().forEach((t) => t.stop());
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.8),
  );
  if (!blob) throw new Error("Nu am putut prelua un cadru de la cameră");
  return blob;
}

export function ProvidersTab({
  draft,
  set,
  onSave,
}: {
  draft: MirrorSettings;
  set: <K extends keyof MirrorSettings>(k: K, v: MirrorSettings[K]) => void;
  onSave: () => void;
}) {
  const [entries, setEntries] = useState<ProviderLogEntry[]>([]);
  const [busy, setBusy] = useState<ProviderId | "">("");
  const [result, setResult] = useState<{ id: ProviderId; url: string; ms: number } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => subscribeProviderLog(setEntries), []);

  const config = {
    podUrl: draft.podUrl,
    podToken: draft.podToken,
    timeoutMs: draft.frameTimeoutMs,
  };

  const test = async (id: ProviderId) => {
    setBusy(id);
    setMessage("");
    try {
      const frame = await testFrame(draft.frameSize);
      const { blob, latencyMs } = await runProviderOnce(
        id,
        frame,
        {
          prompt: sdxlPrompt(draft.sdxlDetail),
          negativePrompt: SDXL_NEGATIVE_PROMPT,
          denoise: draft.frameDenoise,
          seed: draft.frameSeed,
          size: draft.frameSize,
        },
        config,
      );
      setResult({ id, url: URL.createObjectURL(blob), ms: latencyMs });
    } catch (e) {
      setMessage(`${PROVIDER_LABELS[id]}: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const health = async (id: ProviderId) => {
    setBusy(id);
    try {
      const ok = (await getProvider(id).health?.(config)) ?? false;
      setMessage(`${PROVIDER_LABELS[id]}: ${ok ? "disponibil" : "indisponibil"}`);
    } catch (e) {
      setMessage(`${PROVIDER_LABELS[id]}: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const move = (index: number, delta: number) => {
    const list = [...draft.fallbackChain];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const a = list[index];
    const b = list[target];
    if (!a || !b) return;
    list[index] = b;
    list[target] = a;
    set("fallbackChain", list);
  };

  return (
    <>
      <label className={label}>Motor oglindă</label>
      <select
        className={field}
        value={draft.mirrorEngine}
        onChange={(e) => set("mirrorEngine", e.target.value as MirrorSettings["mirrorEngine"])}
      >
        <option value="frames">Pseudo-live 1 FPS (furnizori comutabili)</option>
        <option value="portrait">Portret AI ținut pe ecran</option>
        <option value="delayed">Oglindă întârziată (cap lipit)</option>
      </select>

      <label className={label}>Furnizor pentru buclă</label>
      <select
        className={field}
        value={draft.loopProvider}
        onChange={(e) => set("loopProvider", e.target.value as ProviderId)}
      >
        {PROVIDER_IDS.map((id) => (
          <option key={id} value={id}>
            {PROVIDER_LABELS[id]}
          </option>
        ))}
      </select>

      <label className={label}>Furnizor fotografie premium (QR)</label>
      <select
        className={field}
        value={draft.premiumProvider}
        onChange={(e) => set("premiumProvider", e.target.value as ProviderId)}
      >
        {PROVIDER_IDS.map((id) => (
          <option key={id} value={id}>
            {PROVIDER_LABELS[id]}
          </option>
        ))}
      </select>

      <label className={label}>Lanț de rezervă (în ordine)</label>
      <div className="space-y-2">
        {draft.fallbackChain.map((id, index) => (
          <div key={`${id}-${index}`} className="flex items-center justify-between py-2 hairline-b">
            <span className="text-base">
              {index + 1}. {PROVIDER_LABELS[id]}
            </span>
            <span className="flex gap-4 text-sm">
              <button onClick={() => move(index, -1)} className="text-muted-foreground">
                sus
              </button>
              <button onClick={() => move(index, 1)} className="text-muted-foreground">
                jos
              </button>
              <button
                onClick={() =>
                  set(
                    "fallbackChain",
                    draft.fallbackChain.filter((_, i) => i !== index),
                  )
                }
                className="text-primary"
              >
                scoate
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        {PROVIDER_IDS.filter((id) => !draft.fallbackChain.includes(id)).map((id) => (
          <button
            key={id}
            className="border border-hairline px-5 py-3 text-sm uppercase tracking-[0.15em] transition-colors hover:border-primary hover:text-primary disabled:opacity-40 text-muted-foreground"
            onClick={() => set("fallbackChain", [...draft.fallbackChain, id])}
          >
            + {PROVIDER_LABELS[id]}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Comutare automată după 3 eșecuri consecutive sau răspuns peste 3 secunde; furnizorul
        preferat este reîncercat la 30 de secunde. „Demo" rămâne mereu ultimul.
      </p>

      <label className={label}>Adresa pod-ului nostru (RunPod)</label>
      <input
        className={field}
        placeholder="https://xxxxx-8000.proxy.runpod.net"
        value={draft.podUrl}
        onChange={(e) => set("podUrl", e.target.value)}
      />
      <label className={label}>Token pod (X-Mirror-Token)</label>
      <input
        className={field}
        value={draft.podToken}
        onChange={(e) => set("podToken", e.target.value)}
      />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <label className={label}>Interval (ms)</label>
          <input
            className={field}
            type="number"
            min={400}
            max={5000}
            step={100}
            value={draft.frameIntervalMs}
            onChange={(e) => set("frameIntervalMs", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Timeout (ms)</label>
          <input
            className={field}
            type="number"
            min={1000}
            max={60000}
            step={500}
            value={draft.frameTimeoutMs}
            onChange={(e) => set("frameTimeoutMs", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Dimensiune cadru</label>
          <input
            className={field}
            type="number"
            min={256}
            max={1024}
            step={64}
            value={draft.frameSize}
            onChange={(e) => set("frameSize", Number(e.target.value))}
          />
        </div>
        <div>
          <label className={label}>Denoise</label>
          <input
            className={field}
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={draft.frameDenoise}
            onChange={(e) => set("frameDenoise", Number(e.target.value))}
          />
        </div>
      </div>

      <label className={label}>Seed fix (consistență între cadre)</label>
      <input
        className={field}
        type="number"
        value={draft.frameSeed}
        onChange={(e) => set("frameSeed", Number(e.target.value))}
      />

      <label className={label}>Teste</label>
      <div className="flex flex-wrap gap-6 text-base">
        {PROVIDER_IDS.map((id) => (
          <span key={id} className="flex items-center gap-3">
            <button
              className="border border-hairline px-5 py-3 text-sm uppercase tracking-[0.15em] transition-colors hover:border-primary hover:text-primary disabled:opacity-40 border-primary text-primary"
              disabled={busy === id}
              onClick={() => void test(id)}
            >
              {busy === id ? "…" : `Test ${PROVIDER_LABELS[id]}`}
            </button>
            <button className="text-muted-foreground text-sm" onClick={() => void health(id)}>
              stare
            </button>
          </span>
        ))}
      </div>
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
      {result && (
        <div className="mt-6 flex items-center gap-6">
          <img src={result.url} alt="Rezultat test" className="h-32 w-32 object-cover" />
          <p className="text-sm text-muted-foreground">
            {PROVIDER_LABELS[result.id]} · {result.ms} ms
          </p>
        </div>
      )}

      <label className={label}>Jurnal furnizori (ultimele 20)</label>
      <div className="max-h-64 overflow-y-auto font-mono text-xs text-muted-foreground">
        {entries.length === 0 && <p>fără intrări</p>}
        {[...entries].reverse().map((entry, i) => (
          <p key={`${entry.at}-${i}`}>
            {new Date(entry.at).toLocaleTimeString("ro-RO")} · {entry.provider}
            {entry.latencyMs != null ? ` · ${entry.latencyMs} ms` : ""}
            {entry.note ? ` · ${entry.note}` : ""}
            {entry.error ? ` · EROARE: ${entry.error}` : ""}
          </p>
        ))}
      </div>

      <div className="mt-10">
        <button className="border border-hairline px-5 py-3 text-sm uppercase tracking-[0.15em] transition-colors hover:border-primary hover:text-primary disabled:opacity-40 border-primary text-primary text-lg" onClick={onSave}>
          Salvează furnizorii
        </button>
      </div>
    </>
  );
}
