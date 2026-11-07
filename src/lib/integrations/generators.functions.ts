import { createServerFn } from "@tanstack/react-start";

type GeneratorStatus = { status: string; progress: number; modelUrl: string | null; previewUrl: string | null; error: string | null };
function secret(name: "TRIPO_API_KEY" | "RODIN_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " n'est pas configurée dans les secrets du serveur.");
  return value;
}
function validatePrompt(input: unknown) {
  const prompt = (input as { prompt?: unknown } | null)?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length < 5 || prompt.length > 800) throw new Error("Décris le modèle en 5 à 800 caractères.");
  return { prompt: prompt.trim() };
}
async function jsonRequest(url: string, key: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Authorization: "Bearer " + key, ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Clé API refusée ou accès API insuffisant.");
    if (response.status === 402) throw new Error("Crédits insuffisants sur le compte du fournisseur.");
    if (response.status === 429) throw new Error("Limite de requêtes atteinte. Attends avant de réessayer.");
    throw new Error(String(body.message ?? body.error ?? "Erreur API (" + response.status + ")."));
  }
  return body;
}
function urlFrom(value: unknown): string | null {
  if (typeof value === "string" && /^https:\/\//i.test(value)) return value;
  if (Array.isArray(value)) { for (const item of value) { const found = urlFrom(item); if (found) return found; } }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/url|model|download|preview|glb|fbx|obj/i.test(key)) { const found = urlFrom(item); if (found) return found; }
    }
  }
  return null;
}

export const createTripoTask = createServerFn({ method: "POST" }).inputValidator(validatePrompt).handler(async ({ data }) => {
  const body = await jsonRequest("https://openapi.tripo3d.ai/v3/generation/text-to-model", secret("TRIPO_API_KEY"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: data.prompt, model: "v3.1-20260211", texture: true, pbr: true, texture_quality: "detailed" }),
  });
  const taskId = body.data?.task_id;
  if (body.code !== 0 || typeof taskId !== "string") throw new Error(String(body.message ?? "Tripo n'a pas retourné d'identifiant de tâche."));
  return { taskId };
});

export const getTripoTask = createServerFn({ method: "POST" }).inputValidator((input: unknown) => {
  const id = (input as { taskId?: unknown } | null)?.taskId;
  if (typeof id !== "string" || !/^[a-z0-9_-]{8,100}$/i.test(id)) throw new Error("Identifiant Tripo invalide.");
  return { taskId: id };
}).handler(async ({ data }): Promise<GeneratorStatus> => {
  const body = await jsonRequest("https://openapi.tripo3d.ai/v3/tasks/" + encodeURIComponent(data.taskId), secret("TRIPO_API_KEY"), { method: "GET" });
  if (body.code !== 0) throw new Error(String(body.message ?? "Impossible de lire la tâche Tripo."));
  const task = body.data ?? {};
  const status = String(task.status ?? "unknown");
  const output = task.output ?? task.result ?? {};
  return { status, progress: Math.max(0, Math.min(100, Number(task.progress ?? (status === "success" ? 100 : 0)))), modelUrl: urlFrom(output), previewUrl: urlFrom(task.preview ?? task.thumbnail), error: status === "failed" ? String(task.error ?? task.message ?? "La génération Tripo a échoué.") : null };
});

export const createRodinTask = createServerFn({ method: "POST" }).inputValidator(validatePrompt).handler(async ({ data }) => {
  const form = new FormData();
  form.set("prompt", data.prompt);
  form.set("tier", "Gen-2.5-Low");
  form.set("geometry_file_format", "glb");
  form.set("mesh_mode", "Raw");
  form.set("quality", "medium");
  const response = await fetch("https://api.hyper3d.com/api/v2/rodin", { method: "POST", headers: { Authorization: "Bearer " + secret("RODIN_API_KEY") }, body: form });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Clé Rodin refusée ou accès API insuffisant.");
    if (response.status === 402) throw new Error("Crédits Rodin insuffisants.");
    if (response.status === 429) throw new Error("Limite Rodin atteinte. Réessaie plus tard.");
    throw new Error(String(body.message ?? "Erreur API Rodin (" + response.status + ")."));
  }
  const subscriptionKey = body.jobs?.subscription_key;
  const taskUuid = body.uuid;
  if (typeof subscriptionKey !== "string" || typeof taskUuid !== "string") throw new Error("Rodin n'a pas retourné les identifiants de tâche attendus.");
  return { subscriptionKey, taskUuid };
});

export const getRodinTask = createServerFn({ method: "POST" }).inputValidator((input: unknown) => {
  const value = input as { subscriptionKey?: unknown; taskUuid?: unknown } | null;
  if (typeof value?.subscriptionKey !== "string" || value.subscriptionKey.length < 5 || value.subscriptionKey.length > 500 ||
      typeof value.taskUuid !== "string" || !/^[a-f0-9-]{20,50}$/i.test(value.taskUuid)) throw new Error("Identifiants Rodin invalides.");
  return { subscriptionKey: value.subscriptionKey, taskUuid: value.taskUuid };
}).handler(async ({ data }): Promise<GeneratorStatus> => {
  const key = secret("RODIN_API_KEY");
  const body = await jsonRequest("https://api.hyper3d.com/api/v2/status", key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription_key: data.subscriptionKey }) });
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const states = jobs.map((job: Record<string, unknown>) => String(job.status ?? ""));
  if (states.includes("Failed")) return { status: "Failed", progress: 0, modelUrl: null, previewUrl: null, error: "La génération Rodin a échoué." };
  if (states.length && states.every((state: string) => state === "Done")) {
    const downloads = await jsonRequest("https://api.hyper3d.com/api/v2/download", key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_uuid: data.taskUuid }) });
    return { status: "Done", progress: 100, modelUrl: urlFrom(downloads), previewUrl: null, error: null };
  }
  const progress = states.length ? Math.round(states.filter((state: string) => state === "Done").length / states.length * 100) : 0;
  return { status: states[0] || "Pending", progress, modelUrl: null, previewUrl: null, error: null };
});
