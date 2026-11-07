import { createServerFn } from "@tanstack/react-start";
import type { ChatResult, ChatTurn } from "./types";

const MAX_TURNS = 50;
const MAX_CHARS = 20_000;
const TASKS = ["chat", "code", "search", "game-design", "debug", "review"] as const;

export function validateChatInput(input: unknown): { messages: ChatTurn[]; task: (typeof TASKS)[number] } {
  const msgs = (input as { messages?: unknown })?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_TURNS) {
    throw new Error("Requête invalide : messages manquants ou trop nombreux.");
  }
  const messages = msgs.map((m) => {
    const role = (m as ChatTurn | null)?.role;
    const content = (m as ChatTurn | null)?.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.length > MAX_CHARS
    ) {
      throw new Error("Requête invalide : message mal formé.");
    }
    return { role, content };
  });
  const requestedTask = (input as { task?: unknown })?.task;
  const task = TASKS.includes(requestedTask as (typeof TASKS)[number]) ? requestedTask as (typeof TASKS)[number] : "chat";
  return { messages, task };
}

/** Secure backend entry point for the chat. Returns an explicit status when no model is wired. */
export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator(validateChatInput)
  .handler(async ({ data }): Promise<ChatResult> => {
    try {
      const { resolveProvider } = await import("./registry.server");
      const provider = resolveProvider();
      if (!provider) {
        return {
          ok: false,
          code: "provider_not_configured",
          message:
            "Aucun fournisseur IA n'est configuré sur le serveur. Votre message est enregistré, mais aucune réponse ne peut être générée pour l'instant.",
        };
      }
      const res = await provider.complete({ messages: data.messages, task: data.task ?? "chat" });
      return { ok: true, text: res.text, provider: provider.label, model: res.model };
    } catch (error) {
      const { safeGatewayError } = await import("./gateway-error.server");
      return { ok: false, code: "provider_error", message: safeGatewayError(error).message };
    }
  });
