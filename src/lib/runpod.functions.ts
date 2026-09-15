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

export const runpodState = createServerFn({ method: "GET" }).handler(
  async (): Promise<RunpodState> => {
    const apiKey = key();
    if (!apiKey) return { configured: false, pod: null };
    try {
      const pod = await findPod(apiKey);
      return { configured: true, pod: pod ? shape(pod) : null };
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

      const env: Record<string, string> = {
        PIPELINE: data.pipeline || "streamdiffusionv2",
      };
      const hf = process.env["HF_TOKEN"];
      if (hf) env["HF_TOKEN"] = hf;

      const res = await fetch(`${RUNPOD_API}/pods`, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          name: POD_NAME,
          imageName: data.imageName || "daydreamlive/scope:latest",
          gpuTypeIds: data.gpuTypeIds?.length ? data.gpuTypeIds : [...GPU_PREFERENCE],
          gpuCount: 1,
          cloudType: "SECURE",
          computeType: "GPU",
          containerDiskInGb: 40,
          volumeInGb: 80,
          volumeMountPath: "/workspace",
          ports: [`${SCOPE_PORT}/http`],
          env,
          interruptible: false,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { configured: true, pod: null, error: `RunPod ${res.status}: ${text.slice(0, 300)}` };
      }
      const created = JSON.parse(text) as RawPod;
      return { configured: true, pod: shape(created) };
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
