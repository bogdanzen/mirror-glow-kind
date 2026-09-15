import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  readSessionCounter,
  saveSettings,
  type MirrorSettings,
} from "@/lib/settings";
import { testConnection } from "@/lib/webrtc";

const field =
  "w-full bg-transparent border-b border-hairline py-3 text-[--color-foreground] outline-none focus:border-primary text-base";
const label = "block text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1 mt-6";

export function AdminPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: MirrorSettings;
  onChange: (s: MirrorSettings) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<MirrorSettings>(settings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState<string>("");
  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    if (!unlocked) return;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === "videoinput")))
      .catch(() => undefined);
  }, [unlocked]);

  const set = <K extends keyof MirrorSettings>(k: K, v: MirrorSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const apply = (next: MirrorSettings) => {
    saveSettings(next);
    onChange(next);
    setStatus("Setări salvate.");
  };

  if (!unlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-8">
        <div className="w-full max-w-md text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Admin</p>
          <input
            autoFocus
            value={pin}
            inputMode="numeric"
            type="password"
            onChange={(e) => setPin(e.target.value)}
            className="mt-8 w-full border-b border-hairline bg-transparent py-4 text-center text-3xl tracking-[0.6em] outline-none focus:border-primary"
            placeholder="PIN"
          />
          <div className="mt-10 flex justify-between text-lg">
            <button onClick={onClose} className="text-muted-foreground">
              Închide
            </button>
            <button
              onClick={() => (pin === settings.pin ? setUnlocked(true) : setPin(""))}
              className="text-primary underline underline-offset-8"
            >
              Deblochează
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-8">
      <div className="mx-auto max-w-2xl pb-24">
        <div className="flex items-center justify-between hairline-b pb-4">
          <h1 className="text-2xl">Panou administrare</h1>
          <button onClick={onClose} className="text-muted-foreground">
            Închide
          </button>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Sesiuni astăzi: <span className="text-foreground">{readSessionCounter()}</span>
        </p>

        <label className={label}>Backend base URL</label>
        <input
          className={field}
          value={draft.backendBaseUrl}
          onChange={(e) => set("backendBaseUrl", e.target.value)}
          placeholder="https://api.daydream.live"
        />

        <label className={label}>API key</label>
        <input
          className={field}
          type="password"
          value={draft.apiKey}
          onChange={(e) => set("apiKey", e.target.value)}
        />

        <label className={label}>Pipeline ID</label>
        <input
          className={field}
          value={draft.pipelineId}
          onChange={(e) => set("pipelineId", e.target.value)}
        />

        <label className={label}>Prompt</label>
        <textarea
          className={`${field} h-28`}
          value={draft.prompt}
          onChange={(e) => set("prompt", e.target.value)}
        />

        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className={label}>Lățime</label>
            <input
              className={field}
              type="number"
              value={draft.width}
              onChange={(e) => set("width", Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>Înălțime</label>
            <input
              className={field}
              type="number"
              value={draft.height}
              onChange={(e) => set("height", Number(e.target.value))}
            />
          </div>
          <div>
            <label className={label}>FPS</label>
            <input
              className={field}
              type="number"
              value={draft.fps}
              onChange={(e) => set("fps", Number(e.target.value))}
            />
          </div>
        </div>

        <label className={label}>Cameră</label>
        <select
          className={field}
          value={draft.cameraDeviceId}
          onChange={(e) => set("cameraDeviceId", e.target.value)}
        >
          <option value="">Automat</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-4 gap-6">
          {(
            [
              ["mirrorSeconds", "Oglindă (s)"],
              ["captureSeconds", "Captură (s)"],
              ["thanksSeconds", "Mulțumim (s)"],
              ["idleTimeoutSeconds", "Inactivitate (s)"],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <label className={label}>{l}</label>
              <input
                className={field}
                type="number"
                value={draft[k]}
                onChange={(e) => set(k, Number(e.target.value))}
              />
            </div>
          ))}
        </div>

        <label className={label}>Linie campanie</label>
        <input
          className={field}
          value={draft.campaignLine}
          onChange={(e) => set("campaignLine", e.target.value)}
        />

        <div className="mt-10 flex flex-col gap-4 text-lg">
          <button
            className="text-left"
            onClick={() => set("demoMode", !draft.demoMode)}
          >
            Mod DEMO:{" "}
            <span className={draft.demoMode ? "text-primary" : "text-muted-foreground"}>
              {draft.demoMode ? "pornit" : "oprit"}
            </span>
          </button>
          <button
            className="text-left"
            onClick={() => set("storageEnabled", !draft.storageEnabled)}
          >
            Salvare imagine (24h):{" "}
            <span className={draft.storageEnabled ? "text-primary" : "text-muted-foreground"}>
              {draft.storageEnabled ? "pornită" : "oprită"}
            </span>
          </button>
        </div>

        <label className={label}>PIN nou</label>
        <div className="flex gap-6">
          <input
            className={field}
            value={newPin}
            inputMode="numeric"
            onChange={(e) => setNewPin(e.target.value)}
            placeholder={settings.pin}
          />
          <button
            className="whitespace-nowrap text-primary underline underline-offset-8"
            onClick={() => {
              if (newPin.length >= 4) {
                const next = { ...draft, pin: newPin };
                setDraft(next);
                apply(next);
                setNewPin("");
              }
            }}
          >
            Schimbă
          </button>
        </div>

        <div className="mt-12 flex flex-wrap gap-10 text-lg">
          <button className="text-primary underline underline-offset-8" onClick={() => apply(draft)}>
            Salvează
          </button>
          <button
            className="underline underline-offset-8"
            onClick={async () => {
              setStatus("Se testează…");
              if (!draft.backendBaseUrl) return setStatus("Fără backend — rulează în DEMO.");
              try {
                const { latency } = await testConnection(draft);
                setStatus(`Conexiune OK — ${latency} ms, stream creat și închis.`);
              } catch (e) {
                setStatus(`Eroare: ${(e as Error).message} — se va folosi DEMO.`);
              }
            }}
          >
            Testează conexiunea
          </button>
          <button
            className="underline underline-offset-8"
            onClick={() => {
              apply({ ...DEFAULT_SETTINGS, pin: draft.pin });
              setDraft({ ...DEFAULT_SETTINGS, pin: draft.pin });
            }}
          >
            Resetează setările
          </button>
          <button
            className="underline underline-offset-8"
            onClick={() => window.location.reload()}
          >
            Repornește aplicația
          </button>
        </div>

        {status && <p className="mt-8 text-sm text-muted-foreground">{status}</p>}
      </div>
    </div>
  );
}
