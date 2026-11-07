export type MissionCreateInput = { goal: string; hours: number; maxSteps: number; title: string };

export function validateMissionCreateInput(body: Record<string, unknown>):
  | { ok: true; value: MissionCreateInput }
  | { ok: false; error: string } {
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const hours = Number(body.hours ?? 1);
  const maxSteps = Number(body.max_steps ?? 100);
  if (goal.length < 8 || goal.length > 12_000) {
    return { ok: false, error: "Objectif : 8 à 12 000 caractères." };
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    return { ok: false, error: "Durée : 1 à 168 heures." };
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 2_000) {
    return { ok: false, error: "Nombre d'étapes invalide." };
  }
  const title = (typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : goal.slice(0, 80)).slice(0, 120);
  return { ok: true, value: { goal, hours, maxSteps, title } };
}

export function canResumeMission(status: string, deadlineAt: string, now = Date.now()): boolean {
  return status === "paused" && Number.isFinite(Date.parse(deadlineAt)) && Date.parse(deadlineAt) > now;
}
