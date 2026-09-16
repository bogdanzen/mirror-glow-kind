import { createServerFn } from "@tanstack/react-start";

/**
 * RunPod control plane for the self-hosted Daydream Scope GPU worker.
 * The API key never leaves the server; the browser talks to the pod only
 * through the `scopeProxy` server function below.
 */

const RUNPOD_API = "https://rest.runpod.io/v1";
const POD_NAME = "mirror-scope";
export const SCOPE_PORT = 8000;

export type RunpodPodInfo = {
  id: string;
  name: string;
  desiredStatus: string;
  gpu: string;
  costPerHr: number | null;
  /** Public HTTPS proxy URL of the Scope server, when the pod is running. */
  url: string;
};

export type RunpodState = {
  configured: boolean;
  pod: RunpodPodInfo | null;
  /** Where the machine was rented, e.g. "Europa · România (EU-RO-1)". */
  region?: string;
  error?: string;
};

function key() {
  return process.env["RUNPOD_API_KEY"] ?? "";
}

function headers(apiKey: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

type RawPod = {
  id: string;
  name?: string;
  desiredStatus?: string;
  costPerHr?: number | string;
  machine?: { gpuTypeId?: string; gpuDisplayName?: string };
  gpu?: { displayName?: string };
  publicIp?: string;
};

function podUrl(id: string) {
  return `https://${id}-${SCOPE_PORT}.proxy.runpod.net`;
}

function shape(pod: RawPod): RunpodPodInfo {
  return {
    id: pod.id,
    name: pod.name ?? "",
    desiredStatus: pod.desiredStatus ?? "UNKNOWN",
    gpu: pod.machine?.gpuDisplayName ?? pod.machine?.gpuTypeId ?? pod.gpu?.displayName ?? "",
    costPerHr: pod.costPerHr != null ? Number(pod.costPerHr) : null,
    url: podUrl(pod.id),
  };
}

async function listPods(apiKey: string): Promise<RawPod[]> {
  const res = await fetch(`${RUNPOD_API}/pods`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`RunPod ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as RawPod[] | { data?: RawPod[] };
  return Array.isArray(body) ? body : (body.data ?? []);
}

async function findPod(apiKey: string): Promise<RawPod | null> {
  const pods = await listPods(apiKey);
  return pods.find((p) => p.name === POD_NAME) ?? pods[0] ?? null;
}

/** RunPod only reports the live region through API v2, and only sometimes. */
async function liveRegion(apiKey: string, podId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.runpod.io/v2/pods/${podId}`, {
      headers: headers(apiKey),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { dataCenterId?: string | null };
    return body.dataCenterId ? `Europa · ${body.dataCenterId}` : undefined;
  } catch {
    return undefined;
  }
}

export const runpodState = createServerFn({ method: "GET" }).handler(
  async (): Promise<RunpodState> => {
    const apiKey = key();
    if (!apiKey) return { configured: false, pod: null };
    try {
      const pod = await findPod(apiKey);
      if (!pod) return { configured: true, pod: null };
      const shaped = shape(pod);
      const region = await liveRegion(apiKey, pod.id);
      return { configured: true, pod: shaped, ...(region ? { region } : {}) };
    } catch (error) {
      return { configured: true, pod: null, error: (error as Error).message };
    }
  },
);

/** GPU types worth trying, in order of preference for real-time diffusion. */
export const GPU_PREFERENCE = [
  "NVIDIA GeForce RTX 5090",
  "NVIDIA GeForce RTX 4090",
  "NVIDIA L40S",
  "NVIDIA RTX 6000 Ada Generation",
  "NVIDIA A100 80GB PCIe",
] as const;

const KREA_GPU_PREFERENCE = [
  "NVIDIA L40S",
  "NVIDIA RTX 6000 Ada Generation",
  "NVIDIA A100 80GB PCIe",
] as const;

function gpuPreference(pipeline?: string): string[] {
  // Krea declares ~32 GB VRAM before runtime overhead. Never place it on a
  // 24/32 GB consumer GPU: it can download successfully but fails during load.
  return pipeline === "krea-realtime-video"
    ? [...KREA_GPU_PREFERENCE]
    : [...GPU_PREFERENCE];
}

/**
 * Data centres, Romania first. Model weights are tens of gigabytes and US
 * data centres download them far too slowly for a live event, so machines are
 * always rented in Europe with Bucharest/Timișoara preferred.
 * Override with the RUNPOD_DATA_CENTERS secret (comma-separated codes).
 */
export const EU_DATA_CENTERS = [
  "EU-RO-1",
  "EU-CZ-1",
  "EU-NL-1",
  "EU-FR-1",
  "EU-SE-1",
  "EUR-IS-1",
  "EUR-IS-2",
  "EUR-IS-3",
  "EUR-NO-1",
] as const;

function preferredDataCenters(): string[] {
  const raw = process.env["RUNPOD_DATA_CENTERS"] ?? "";
  const list = raw
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : [...EU_DATA_CENTERS];
}

/** True when the machine simply is not there — worth retrying elsewhere. */
function isCapacityError(text: string): boolean {
  return /no instances|not enough|unavailable|capacity|no machines|sold out|exhausted|out of stock/i.test(
    text,
  );
}

function regionLabel(codes: string[]): string {
  if (codes[0] === "EU-RO-1") return "Europa · România (EU-RO-1)";
  return `Europa (${codes.join(", ")})`;
}

async function postPod(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${RUNPOD_API}/pods`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

async function createPod(
  apiKey: string,
  data: { imageName?: string; pipeline?: string; gpuTypeIds?: string[] },
): Promise<RunpodState> {
  const env: Record<string, string> = {
    PIPELINE: data.pipeline || "streamdiffusionv2",
  };
  const hf = process.env["HF_TOKEN"];
  // Required only while a fresh volume downloads gated model files. Once the
  // cache is complete this must be removed before Scope starts, because v0.2.5
  // otherwise selects the retired Hugging Face TURN endpoint.
  if (hf) env["HF_TOKEN"] = hf;
  // Cloudflare TURN lets the GPU relay media when it has no public IP.
  const turnId = process.env["CLOUDFLARE_TURN_KEY_ID"];
  const turnToken = process.env["CLOUDFLARE_TURN_KEY_API_TOKEN"];
  if (turnId && turnToken) {
    env["CLOUDFLARE_TURN_KEY_ID"] = turnId;
    env["CLOUDFLARE_TURN_KEY_API_TOKEN"] = turnToken;
  }

  const body: Record<string, unknown> = {
    name: POD_NAME,
    imageName: data.imageName || "daydreamlive/scope:latest",
    gpuTypeIds: data.gpuTypeIds?.length ? data.gpuTypeIds : gpuPreference(data.pipeline),
    gpuCount: 1,
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 40,
    volumeInGb: 80,
    volumeMountPath: "/workspace",
    ports: [`${SCOPE_PORT}/http`],
    env,
    // Scope currently caches TURN credentials at process start. A public
    // media route provides a stable fallback after those credentials expire.
    globalNetworking: true,
    interruptible: false,
  };

  // Rent in Europe, Romania first: the model is tens of GB and US machines
  // take far too long to pull it. "custom" keeps the order we asked for.
  const centers = preferredDataCenters();
  let res = await postPod(apiKey, {
    ...body,
    dataCenterIds: centers,
    dataCenterPriority: "custom",
  });
  let region = regionLabel(centers);

  // Only when Europe is genuinely full do we accept another region.
  if (!res.ok && isCapacityError(res.text)) {
    const retry = await postPod(apiKey, body);
    if (retry.ok) {
      res = retry;
      region = "în afara Europei (Europa fără capacitate)";
    }
  }

  if (!res.ok) {
    return { configured: true, pod: null, error: `RunPod ${res.status}: ${res.text.slice(0, 300)}` };
  }
  return { configured: true, pod: shape(JSON.parse(res.text) as RawPod), region };
}

export const startRunpodPod = createServerFn({ method: "POST" })
  .validator((input: { imageName?: string; pipeline?: string; gpuTypeIds?: string[] }) => input ?? {})
  .handler(async ({ data }): Promise<RunpodState> => {
    const apiKey = key();
    if (!apiKey) return { configured: false, pod: null, error: "RUNPOD_API_KEY lipsește" };

    try {
      const existing = await findPod(apiKey);
      if (existing) {
        if ((existing.desiredStatus ?? "") !== "RUNNING") {
          const res = await fetch(`${RUNPOD_API}/pods/${existing.id}/start`, {
            method: "POST",
            headers: headers(apiKey),
          });
          if (!res.ok) {
            return {
              configured: true,
              pod: shape(existing),
              error: `Pornire eșuată ${res.status}: ${(await res.text()).slice(0, 200)}`,
            };
          }
        }
        const refreshed = await findPod(apiKey);
        return { configured: true, pod: refreshed ? shape(refreshed) : shape(existing) };
      }

      return await createPod(apiKey, data);
    } catch (error) {
      return { configured: true, pod: null, error: (error as Error).message };
    }
  });


export const stopRunpodPod = createServerFn({ method: "POST" })
  .validator((input: { id: string; terminate?: boolean }) => input)
  .handler(async ({ data }) => {
    const apiKey = key();
    if (!apiKey || !data.id) return { ok: false, error: "Lipsește cheia sau pod-ul" };
    const url = data.terminate ? `${RUNPOD_API}/pods/${data.id}` : `${RUNPOD_API}/pods/${data.id}/stop`;
    try {
      const res = await fetch(url, {
        method: data.terminate ? "DELETE" : "POST",
        headers: headers(apiKey),
      });
      return { ok: res.ok, error: res.ok ? undefined : `${res.status}: ${(await res.text()).slice(0, 200)}` };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

/**
 * Repairs corrupted model files: the Scope API cannot delete them, so the pod
 * and its volume are terminated and a clean one is created. This is the only
 * reliable way to clear a half-written weight file.
 */
export const repairRunpodPod = createServerFn({ method: "POST" })
  .validator((input: { pipeline?: string }) => input ?? {})
  .handler(async ({ data }): Promise<RunpodState> => {
    const apiKey = key();
    if (!apiKey) return { configured: false, pod: null, error: "RUNPOD_API_KEY lipsește" };
    try {
      const existing = await findPod(apiKey);
      if (existing) {
        const res = await fetch(`${RUNPOD_API}/pods/${existing.id}`, {
          method: "DELETE",
          headers: headers(apiKey),
        });
        if (!res.ok) {
          return {
            configured: true,
            pod: shape(existing),
            error: `Ștergerea pod-ului a eșuat ${res.status}: ${(await res.text()).slice(0, 200)}`,
          };
        }
        // RunPod needs a moment to release the volume before a new pod can use the name.
        await new Promise((r) => setTimeout(r, 5000));
      }
      return await createPod(apiKey, data.pipeline ? { pipeline: data.pipeline } : {});
    } catch (error) {
      return { configured: true, pod: null, error: (error as Error).message };
    }
  });

/**
 * Proxies a Scope HTTP call to the running pod. Keeps the pod URL and any
 * future auth server-side and avoids browser CORS against the RunPod proxy.
 */
export const scopeProxy = createServerFn({ method: "POST" })
  .validator(
    (input: { path: string; method?: string; body?: unknown; podId?: string; baseUrl?: string }) =>
      input,
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; status: number; text: string; error: string }> => {
      let base = data.baseUrl || (data.podId ? podUrl(data.podId) : "");
      if (!base) {
        const apiKey = key();
        if (!apiKey) return { ok: false, status: 0, text: "", error: "RUNPOD_API_KEY lipsește" };
        const pod = await findPod(apiKey).catch(() => null);
        if (!pod) return { ok: false, status: 0, text: "", error: "Niciun pod RunPod activ" };
        base = podUrl(pod.id);
      }
      try {
        const init: RequestInit = { method: data.method ?? "GET" };
        if (data.body !== undefined) {
          init.headers = { "Content-Type": "application/json" };
          init.body = JSON.stringify(data.body);
        }
        const res = await fetch(`${base}${data.path}`, init);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text: text.slice(0, 200000), error: "" };
      } catch (error) {
        return { ok: false, status: 0, text: "", error: (error as Error).message };
      }
    },
  );
