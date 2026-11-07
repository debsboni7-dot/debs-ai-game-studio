import { createServerFn } from "@tanstack/react-start";

function getMeshyKey() {
  const key = process.env.MESHY_API_KEY?.trim();
  if (!key) throw new Error("MESHY_API_KEY n'est pas configurée dans les secrets du serveur.");
  return key;
}
async function meshyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("https://api.meshy.ai" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + getMeshyKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string; result?: string };
  if (!response.ok) {
    if (response.status === 401) throw new Error("Clé Meshy refusée. Vérifie MESHY_API_KEY.");
    if (response.status === 402) throw new Error("Crédits Meshy insuffisants ou API non incluse dans ton forfait.");
    if (response.status === 429) throw new Error("Limite de requêtes Meshy atteinte. Réessaie plus tard.");
    throw new Error(body.message || body.error || "Erreur API Meshy (" + response.status + ").");
  }
  return body as T;
}

export const createMeshyPreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = input as { prompt?: unknown; model?: unknown };
    if (typeof value.prompt !== "string" || value.prompt.trim().length < 5 || value.prompt.length > 800) {
      throw new Error("Décris ton modèle en 5 à 800 caractères.");
    }
    const allowed = ["meshy-6-lite", "meshy-6", "meshy-7.1"];
    const model = typeof value.model === "string" && allowed.includes(value.model) ? value.model : "meshy-7.1";
    return { prompt: value.prompt.trim(), model };
  })
  .handler(async ({ data }) => {
    const result = await meshyRequest<{ result: string }>("/openapi/v2/text-to-3d", {
      method: "POST",
      body: JSON.stringify({
        mode: "preview",
        prompt: data.prompt,
        ai_model: data.model,
        target_formats: ["glb"],
        pose_mode: "a-pose",
      }),
    });
    if (!result.result) throw new Error("Meshy n'a pas retourné d'identifiant de tâche.");
    return { taskId: result.result };
  });

export const getMeshyTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const id = (input as { taskId?: unknown } | null)?.taskId;
    if (typeof id !== "string" || !/^[a-f0-9-]{20,50}$/i.test(id)) throw new Error("Identifiant de tâche Meshy invalide.");
    return { taskId: id };
  })
  .handler(async ({ data }) => {
    const task = await meshyRequest<{
      id: string; status: string; progress?: number; model_urls?: { glb?: string };
      thumbnail_url?: string; task_error?: { message?: string } | null;
    }>("/openapi/v2/text-to-3d/" + encodeURIComponent(data.taskId), { method: "GET", headers: { "Content-Type": "application/json" } });
    return {
      id: task.id,
      status: task.status,
      progress: Math.max(0, Math.min(100, Number(task.progress ?? 0))),
      modelUrl: task.model_urls?.glb ?? null,
      thumbnailUrl: task.thumbnail_url ?? null,
      error: task.task_error?.message ?? null,
    };
  });
