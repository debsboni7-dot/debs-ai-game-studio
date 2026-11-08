export type AgentChatMessage = { role: "system" | "user"; content: string };

export function buildAgentCompletionPayload(model: string, prompt: string) {
  if (!model.trim()) throw new Error("Le modèle DEBS est requis.");
  if (!prompt.trim()) throw new Error("Le prompt de mission est vide.");
  if (prompt.length > 19_000) throw new Error("Le contexte de mission dépasse la limite autorisée.");
  return {
    model,
    messages: [
      {
        role: "system" as const,
        content: "Tu es le moteur de missions autonome DEBS. Réponds en français et respecte strictement le format JSON demandé par l'utilisateur système. N'invente aucune lecture de fichier, modification ou exécution.",
      },
      { role: "user" as const, content: prompt },
    ],
    temperature: 0,
    max_tokens: 10_000,
    stream: false,
  };
}

export function extractAgentCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Réponse invalide du serveur d’inférence DEBS.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Le modèle DEBS n’a renvoyé aucun choix.");
  }
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Le modèle DEBS a renvoyé une réponse vide ou non textuelle.");
  }
  return content.trim();
}
