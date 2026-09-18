import { useEffect, useState } from "react";
import {
  DEFAULT_MESSAGES,
  DEFAULT_SETTINGS,
  SCOPE_PIPELINES,
  appendSessionLog,
  clearSessionLog,
  readSessionCounter,
  readSessionLog,
  readModelTimings,
  saveSettings,
  type MirrorSettings,
  type SessionLogEntry,
} from "@/lib/settings";
import {
  repairRunpodPod,
  runpodState,
  startRunpodPod,
  stopRunpodPod,
  type RunpodState,
} from "@/lib/runpod.functions";
import {
  prewarmMirror,
  resetMirrorWarm,
  startMirrorSession,
  subscribeMirrorWarm,
} from "@/lib/mirror";
import { reloadMirrorResolution } from "@/lib/mirror";
import { PinPad } from "@/components/PinPad";
import type { WarmState } from "@/lib/scope";
import { clearDiag, subscribeDiag, type DiagEntry } from "@/lib/diag";
import { mirrorTurnCredentials } from "@/lib/turn.functions";


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
  const [tab, setTab] = useState<"setari" | "mesaje">("setari");
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<MirrorSettings>(settings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState<string>("");
  const [newPin, setNewPin] = useState("");
  const [log, setLog] = useState<SessionLogEntry[]>([]);
  const [runpod, setRunpod] = useState<RunpodState | null>(null);
  const [podMsg, setPodMsg] = useState("");
  const [turnMsg, setTurnMsg] = useState("");
  const [diagEntries, setDiagEntries] = useState<DiagEntry[]>([]);
  const [warm, setWarm] = useState<WarmState>({
    stage: "idle",
    detail: "",
    fatal: false,
    since: 0,
  });

  useEffect(() => subscribeDiag(setDiagEntries), []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void subscribeMirrorWarm(setWarm).then((fn) => (unsub = fn));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === "videoinput")))
      .catch(() => undefined);
    setLog(readSessionLog());
    void runpodState()
      .then(setRunpod)
      .catch(() => setRunpod({ configured: false, pod: null }));
  }, [unlocked]);

  const set = <K extends keyof MirrorSettings>(k: K, v: MirrorSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // Measured generation time per model, so the fastest one is obvious.
  const timings = unlocked ? readModelTimings() : {};
  const timing = (model: string) => {
    const t = timings[model];
    return t ? `${(t.avgMs / 1000).toFixed(1)} s` : "—";
  };

  const apply = (next: MirrorSettings) => {
    saveSettings(next);
    onChange(next);
    setStatus("Setări salvate.");
  };

  if (!unlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-8">
        <div className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Administrare</p>
          <div className="mt-6 hairline-b py-6 text-center font-display text-4xl tracking-[0.5em]">
            {pin ? "•".repeat(pin.length) : <span className="text-muted-foreground">PIN</span>}
          </div>
          <PinPad value={pin} onChange={setPin} />
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

        <div className="mt-6 flex gap-8 hairline-b pb-3 text-sm uppercase tracking-[0.25em]">
          {(
            [
              ["setari", "Setări"],
              ["mesaje", "Mesaje"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={tab === value ? "text-primary" : "text-muted-foreground"}
            >
              {text}
            </button>
          ))}
        </div>

        {tab === "mesaje" && (
          <>
            {(
              [
                ["attractKicker", "Atract — supratitlu"],
                ["attractTitle", "Atract — titlu"],
                ["attractSubtitle", "Atract — subtitlu"],
                ["attractCta", "Atract — îndemn"],
                ["consentTitle", "Consimțământ — titlu"],
                ["consentBody", "Consimțământ — text"],
                ["consentCheckbox", "Consimțământ — bifă"],
                ["consentContinue", "Consimțământ — buton"],
                ["consentDecline", "Consimțământ — renunț"],
                ["framingKicker", "Countdown — supratitlu"],
                ["framingTitle", "Countdown — titlu"],
                ["framingCaption", "Countdown — text mic"],
                ["mirrorKicker", "Oglindă — supratitlu"],
                ["mirrorTitle", "Oglindă — titlu"],
                ["mirrorFooter", "Oglindă — text jos"],
                ["mirrorWorking", "Oglindă — mesaj procesare"],
                ["choiceKicker", "Alegere — supratitlu"],
                ["choiceTitle", "Alegere — titlu"],
                ["healthyTitle", "Prevenție — titlu"],
                ["healthyBody", "Prevenție — text"],
                ["finalKicker", "Final — supratitlu"],
                ["finalTitleTop", "Final — titlu rând 1"],
                ["finalTitleBottom", "Final — titlu rând 2"],
                ["finalSubtitle", "Final — subtitlu"],
                ["finalQrLabel", "Final — text QR"],
                ["finalOptions", "Final — opțiuni (una pe rând)"],
                ["finalPresence", "Final — buton prezență"],
              ] as const
            ).map(([key, text]) => {
              const multiline =
                draft.messages[key].includes("\n") || draft.messages[key].length > 60;
              return (
                <div key={key}>
                  <label className={label}>{text}</label>
                  {multiline ? (
                    <textarea
                      className={`${field} min-h-24 resize-none`}
                      value={draft.messages[key]}
                      onChange={(e) =>
                        set("messages", { ...draft.messages, [key]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      className={field}
                      value={draft.messages[key]}
                      onChange={(e) =>
                        set("messages", { ...draft.messages, [key]: e.target.value })
                      }
                    />
                  )}
                </div>
              );
            })}
            <div className="mt-10 flex gap-10 text-lg">
              <button
                className="text-primary underline underline-offset-8"
                onClick={() => apply(draft)}
              >
                Salvează mesajele
              </button>
              <button
                className="underline underline-offset-8"
                onClick={() => {
                  const next = { ...draft, messages: DEFAULT_MESSAGES };
                  setDraft(next);
                  apply(next);
                }}
              >
                Revino la textele originale
              </button>
            </div>
            {status && <p className="mt-8 text-sm text-muted-foreground">{status}</p>}
          </>
        )}

        {tab === "setari" && (
          <>

        {(
          <>
            <label className={label}>GPU RunPod (Scope)</label>
            <p className="py-3 text-base text-muted-foreground">
              {runpod === null
                ? "se verifică…"
                : !runpod.configured
                  ? "cheie RunPod lipsă"
                  : runpod.pod
                    ? `${runpod.pod.desiredStatus} · ${runpod.pod.gpu || "GPU"} · ${
                        runpod.pod.costPerHr != null ? `${runpod.pod.costPerHr} $/h` : ""
                      }`
                    : "niciun pod pornit"}
              {runpod?.error ? ` · ${runpod.error}` : ""}
              {runpod?.region ? ` · ${runpod.region}` : ""}
              {podMsg ? ` · ${podMsg}` : ""}
            </p>
            <div className="flex flex-wrap gap-8 py-2 text-base">
              <button
                className="text-primary underline underline-offset-8"
                onClick={() => {
                  setPodMsg("se pornește…");
                  void startRunpodPod({ data: { pipeline: draft.scopePipeline } })
                    .then((r) => {
                      setRunpod(r);
                      setPodMsg(r.error ?? "pornit");
                    })
                    .catch((e: Error) => setPodMsg(e.message));
                }}
              >
                Pornește GPU
              </button>
              <button
                className="text-muted-foreground underline underline-offset-8"
                onClick={() => {
                  void runpodState()
                    .then(setRunpod)
                    .catch(() => undefined);
                  setPodMsg("");
                }}
              >
                Reîmprospătează
              </button>
              <button
                className="text-muted-foreground underline underline-offset-8"
                disabled={!runpod?.pod}
                onClick={() => {
                  if (!runpod?.pod) return;
                  setPodMsg("se oprește…");
                  void stopRunpodPod({ data: { id: runpod.pod.id } }).then((r) => {
                    setPodMsg(r.error ?? "oprit");
                    void runpodState().then(setRunpod);
                  });
                }}
              >
                Oprește
              </button>
              <button
                className="text-muted-foreground underline underline-offset-8"
                disabled={!runpod?.pod}
                onClick={() => {
                  if (!runpod?.pod) return;
                  setPodMsg("se șterge…");
                  void stopRunpodPod({ data: { id: runpod.pod.id, terminate: true } }).then((r) => {
                    setPodMsg(r.error ?? "șters");
                    void runpodState().then(setRunpod);
                  });
                }}
              >
                Șterge pod
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              GPU-ul se taxează la oră cât timp rulează. Oprește-l după eveniment.
            </p>

            <label className={label}>Stare pregătire</label>
            <p
              className={`py-3 text-base ${
                warm.stage === "ready"
                  ? "text-primary"
                  : warm.fatal
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {warm.stage === "ready"
                ? "PREGĂTIT — sesiunile pornesc instant"
                : `${warm.stage.toUpperCase()}${warm.detail ? ` · ${warm.detail}` : ""}`}
            </p>
            {warm.fatal && (
              <p className="text-xs text-primary">
                Fișierele modelului sunt corupte. Folosește „Repară modelul” — pod-ul și discul sunt
                recreate curat, iar modelul se descarcă o singură dată.
              </p>
            )}
            <div className="flex flex-wrap gap-8 py-2 text-base">
              <button
                className="text-primary underline underline-offset-8"
                onClick={() => {
                  setPodMsg("se repară (pod nou + model curat)…");
                  void resetMirrorWarm();
                  void repairRunpodPod({ data: { pipeline: draft.scopePipeline } })
                    .then((r) => {
                      setRunpod(r);
                      setPodMsg(r.error ?? "pod nou creat — pornește pre-încălzirea");
                    })
                    .catch((e: Error) => setPodMsg(e.message));
                }}
              >
                Repară modelul
              </button>
            </div>

            <label className={label}>Pipeline Scope</label>
            <select
              className={field}
              value={draft.scopePipeline}
              onChange={(e) => set("scopePipeline", e.target.value)}
            >
              {SCOPE_PIPELINES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <label className={label}>Releu video Cloudflare (automat)</label>
            <div className="flex items-center gap-6">
              <button
                className="border border-hairline px-6 py-3 text-xs uppercase tracking-[0.2em]"
                onClick={() => {
                  setTurnMsg("verific releul…");
                  void mirrorTurnCredentials({ data: { ttl: 600 } })
                    .then((r) =>
                      setTurnMsg(
                        r.ok
                          ? `releu activ · ${r.iceServers.length} servere ICE · valabil ${Math.round(r.ttl / 60)} min`
                          : `releu indisponibil: ${r.error}`,
                      ),
                    )
                    .catch((e: Error) => setTurnMsg(`releu indisponibil: ${e.message}`));
                }}
              >
                Testează releul
              </button>
              <span className="text-xs text-muted-foreground">{turnMsg}</span>
            </div>

            <label className={label}>Releu TURN manual (opțional)</label>
            <input
              className={field}
              placeholder="turn:host:3478"
              value={draft.turnUrl}
              onChange={(e) => set("turnUrl", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-6">
              <input
                className={field}
                placeholder="utilizator"
                value={draft.turnUsername}
                onChange={(e) => set("turnUsername", e.target.value)}
              />
              <input
                className={field}
                placeholder="parolă"
                value={draft.turnCredential}
                onChange={(e) => set("turnCredential", e.target.value)}
              />
            </div>
          </>
        )}

        <label className={label}>Pași de denoising (latență)</label>
        <input
          className={field}
          value={draft.scopeDenoiseSteps.join(", ")}
          onChange={(e) =>
            set(
              "scopeDenoiseSteps",
              e.target.value
                .split(",")
                .map((v) => Number(v.trim()))
                .filter((v) => Number.isFinite(v) && v > 0),
            )
          }
        />
        <p className="text-xs text-muted-foreground">
          Mai puțini pași = latență mai mică. Implicit 650, 500.
        </p>

        <label className={label}>Claritate (latura lungă a imaginii AI)</label>
        <input
          className={field}
          type="number"
          min={320}
          max={1280}
          step={16}
          value={draft.outputLongEdge}
          onChange={(e) => set("outputLongEdge", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Latura scurtă se calculează automat din raportul ecranului, deci imaginea nu mai este
          deformată. Mai mare = mai clar, dar mai lent.
        </p>

        <label className={label}>Libertate față de chip (noise)</label>
        <input
          className={field}
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={draft.noiseScale}
          onChange={(e) => set("noiseScale", Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Valori mici = imagine mai stabilă și mai fidelă. Implicit 0.35.
        </p>

        <button
          className="mt-6 hairline-t hairline-b w-full py-4 text-left text-primary"
          onClick={() => {
            apply(draft);
            setStatus("Reîncarc modelul la rezoluția ecranului…");
            void reloadMirrorResolution(draft)
              .then(() => setStatus("Model reîncărcat la rezoluția ecranului."))
              .catch((e: Error) => setStatus(`Reîncărcare eșuată: ${e.message}`));
          }}
        >
          Reîncarcă modelul la rezoluția ecranului (fără repornirea mașinii)
        </button>




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
          <button className="text-left" onClick={() => set("fallbackMode", !draft.fallbackMode)}>
            Mod rezervă (portret AI pe server, fără GPU):{" "}
            <span className={draft.fallbackMode ? "text-primary" : "text-muted-foreground"}>
              {draft.fallbackMode ? "pornit" : "oprit"}
            </span>
          </button>
          {draft.fallbackMode && (
            <>
              <label className={label}>Tip oglindă</label>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ["portrait", "Portret fix (o poză transformată)"],
                    ["delayed", "Oglindă întârziată (video + cap generat)"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    onClick={() => set("mirrorEngine", value)}
                    className={`border px-5 py-3 text-left ${
                      draft.mirrorEngine === value
                        ? "border-primary text-primary"
                        : "border-foreground/20 text-muted-foreground"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {draft.mirrorEngine === "delayed" && (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Video-ul de la cameră rulează cu întârziere; între timp capul este decupat,
                    generat fără păr și lipit înapoi peste înregistrarea reală. Necesită motorul
                    fal.ai (SDXL Lightning).
                  </p>
                  <label className={label}>
                    Întârziere video: {(draft.delayMs / 1000).toFixed(1)} s
                  </label>
                  <input
                    type="range"
                    min={500}
                    max={4000}
                    step={100}
                    value={draft.delayMs}
                    onChange={(e) => set("delayMs", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />
                  <label className={label}>Capete generate pe secundă: {draft.genFps}</label>
                  <input
                    type="range"
                    min={0.5}
                    max={4}
                    step={0.5}
                    value={draft.genFps}
                    onChange={(e) => set("genFps", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />
                  <label className={label}>Decupaj cap</label>
                  <div className="flex gap-3">
                    {[768, 1024].map((value) => (
                      <button
                        key={value}
                        onClick={() => set("cropSize", value)}
                        className={`border px-5 py-3 ${
                          draft.cropSize === value
                            ? "border-primary text-primary"
                            : "border-foreground/20 text-muted-foreground"
                        }`}
                      >
                        {value}px
                      </button>
                    ))}
                  </div>
                  <label className={label}>
                    Spațiu în jurul capului: {draft.headMargin.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={1.6}
                    step={0.05}
                    value={draft.headMargin}
                    onChange={(e) => set("headMargin", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />
                  <label className={label}>Margine estompată: {draft.featherPx}px</label>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={draft.featherPx}
                    onChange={(e) => set("featherPx", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />
                  <label className={label}>Sămânță fixă (același chip): {draft.falSeed}</label>
                  <input
                    className={field}
                    type="number"
                    value={draft.falSeed}
                    onChange={(e) => set("falSeed", Number(e.target.value))}
                  />
                  <button className="text-left" onClick={() => set("headDebug", !draft.headDebug)}>
                    Afișează urmărirea capului:{" "}
                    <span className={draft.headDebug ? "text-primary" : "text-muted-foreground"}>
                      {draft.headDebug ? "pornit" : "oprit"}
                    </span>
                  </button>
                </>
              )}

              <label className={label}>Motor imagine</label>
              <div className="flex gap-3">
                {(
                  [
                    ["lovable", "Model pe server (fidelitate maximă)"],
                    ["fal", "Diffusion flash (fal.ai, sub o secundă)"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    onClick={() => set("fallbackProvider", value)}
                    className={`border px-5 py-3 text-left ${
                      draft.fallbackProvider === value
                        ? "border-primary text-primary"
                        : "border-foreground/20 text-muted-foreground"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {draft.fallbackProvider === "fal" && (
                <>
                  <label className={label}>Cheie API fal.ai</label>
                  <input
                    className={field}
                    type="password"
                    placeholder="key_id:key_secret"
                    value={draft.falKey}
                    onChange={(e) => set("falKey", e.target.value)}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Se ia din fal.ai → Keys. Dacă rămâne gol, se folosește cheia FAL_KEY salvată pe server.
                  </p>

                  <label className={label}>Model flash</label>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ["fal-ai/fast-lightning-sdxl/image-to-image", "SDXL Lightning (recomandat)"],
                        ["fal-ai/fast-lcm-diffusion/image-to-image", "LCM (cel mai rapid)"],
                        ["fal-ai/fast-sdxl/image-to-image", "SDXL rapid"],
                        ["fal-ai/flux/schnell/image-to-image", "FLUX schnell"],
                      ] as const
                    ).map(([value, text]) => (
                      <button
                        key={value}
                        onClick={() => set("falModel", value)}
                        className={`border px-5 py-3 ${
                          draft.falModel === value
                            ? "border-primary text-primary"
                            : "border-foreground/20 text-muted-foreground"
                        }`}
                      >
                        {text}
                        <span className="ml-2 text-xs opacity-70">{timing(value)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Durata afișată e media măsurată pe acest ecran, pentru o imagine.
                  </p>

                  <label className={label}>Detalii prompt (se adaugă la promptul fix de ras)</label>
                  <textarea
                    className={`${field} min-h-20 resize-none`}
                    placeholder="ex: lumină rece, privire serioasă"
                    value={draft.sdxlDetail}
                    onChange={(e) => set("sdxlDetail", e.target.value)}
                  />

                  <label className={label}>
                    Intensitate transformare: {draft.falStrength.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={draft.falStrength}
                    onChange={(e) => set("falStrength", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />

                  <label className={label}>Pași de difuzie: {draft.falSteps}</label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={draft.falSteps}
                    onChange={(e) => set("falSteps", Number(e.target.value))}
                    className="w-full accent-[--color-primary]"
                  />
                </>
              )}

              <label className={label}>Reîmprospătare portret</label>
              <div className="flex gap-3">
                {(
                  [
                    ["off", "Oprit"],
                    ["normal", "Normal"],
                    ["fast", "Rapid"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    onClick={() => set("fallbackRefresh", value)}
                    className={`border px-5 py-3 ${
                      draft.fallbackRefresh === value
                        ? "border-primary text-primary"
                        : "border-foreground/20 text-muted-foreground"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {draft.fallbackProvider === "lovable" && (
                <>
                  <label className={label}>Model imagine</label>
                  <div className="flex gap-3">
                    {(
                      [
                        ["openai/gpt-image-2.5-flare", "Rapid"],
                        ["openai/gpt-image-2.5-sunburst", "Calitate maximă"],
                      ] as const
                    ).map(([value, text]) => (
                      <button
                        key={value}
                        onClick={() => set("fallbackModel", value)}
                        className={`border px-5 py-3 ${
                          draft.fallbackModel === value
                            ? "border-primary text-primary"
                            : "border-foreground/20 text-muted-foreground"
                        }`}
                      >
                        {text}
                        <span className="ml-2 text-xs opacity-70">{timing(value)}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Durata măsurată pentru o imagine, pe acest ecran.
                  </p>
                </>
              )}

              <label className={label}>Prompt mod rezervă</label>
              <textarea
                className={`${field} min-h-32 resize-none`}
                value={draft.fallbackPrompt}
                onChange={(e) => set("fallbackPrompt", e.target.value)}
              />
            </>
          )}
          <button className="text-left" onClick={() => set("diagnostics", !draft.diagnostics)}>
            Mod diagnostic (verbose):{" "}
            <span className={draft.diagnostics ? "text-primary" : "text-muted-foreground"}>
              {draft.diagnostics ? "pornit" : "oprit"}
            </span>
          </button>
          <button className="text-left" onClick={() => set("prewarm", !draft.prewarm)}>
            Pre-încălzire GPU:{" "}
            <span className={draft.prewarm ? "text-primary" : "text-muted-foreground"}>
              {draft.prewarm ? "pornită" : "oprită"}
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
              const started = performance.now();
              try {
                const session = await startMirrorSession({
                  settings: draft,
                  onStatus: (s) => setStatus(`Stare: ${s}`),
                });
                const video = document.createElement("video");
                video.muted = true;
                video.playsInline = true;
                video.srcObject = session.processedStream;
                await video.play().catch(() => undefined);
                await new Promise<void>((resolve) => {
                  const t = window.setTimeout(resolve, 15000);
                  const check = () => {
                    if (video.videoWidth) {
                      window.clearTimeout(t);
                      resolve();
                    } else requestAnimationFrame(check);
                  };
                  check();
                });
                const latency = Math.round(performance.now() - started);
                await new Promise((r) => setTimeout(r, 3000));
                await session.stop();
                session.cameraStream.getTracks().forEach((t) => t.stop());
                appendSessionLog({ at: Date.now(), status: "test", latencyMs: latency });
                setLog(readSessionLog());
                setStatus(`Conexiune OK — primul cadru procesat în ${latency} ms. Stream închis.`);
              } catch (e) {
                appendSessionLog({
                  at: Date.now(),
                  status: "error",
                  error: (e as Error).message,
                });
                setLog(readSessionLog());
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
            onClick={() => {
              setStatus("Se pre-încălzește GPU-ul…");
              void prewarmMirror(draft, (_s, detail) => detail && setStatus(`Pre-încălzire: ${detail}`))
                .then(() => setStatus("GPU pregătit — sesiunile pornesc instant."))
                .catch((e: Error) => setStatus(`Pre-încălzire eșuată: ${e.message}`));
            }}
          >
            Pre-încălzește GPU
          </button>
          <button
            className="underline underline-offset-8"
            onClick={() => window.location.reload()}
          >
            Repornește aplicația
          </button>
        </div>

        <div className="mt-12 hairline-t pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Diagnostic live</h2>
            <button
              className="text-sm text-muted-foreground underline underline-offset-8"
              onClick={() => clearDiag()}
            >
              Golește
            </button>
          </div>
          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto font-mono text-[11px] text-muted-foreground">
            {diagEntries.length === 0 && <li>Fără evenimente încă.</li>}
            {[...diagEntries].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`} className={e.level === "error" ? "text-primary" : ""}>
                {new Date(e.at).toLocaleTimeString("ro-RO")} · {e.scope} · {e.message}
              </li>
            ))}
          </ul>
        </div>

        {status && <p className="mt-8 text-sm text-muted-foreground">{status}</p>}

        <div className="mt-12 hairline-t pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Jurnal sesiuni (ultimele 50)</h2>
            <button
              className="text-sm text-muted-foreground underline underline-offset-8"
              onClick={() => {
                clearSessionLog();
                setLog([]);
              }}
            >
              Golește
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {log.length === 0 && <li>Nicio înregistrare.</li>}
            {[...log].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-4">
                <span>{new Date(e.at).toLocaleTimeString("ro-RO")}</span>
                <span className={e.status === "error" ? "text-primary" : "text-foreground"}>
                  {e.status}
                </span>
                {e.latencyMs != null && <span>{e.latencyMs} ms</span>}
                {e.error && <span className="truncate">{e.error}</span>}
              </li>
            ))}
          </ul>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
