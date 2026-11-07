import { createServerFn } from "@tanstack/react-start";
import type { ChatResult, ChatTurn } from "./types";

const MAX_TURNS = 50;
const MAX_CHARS = 20_000;

export function validateChatInput(input: unknown): { messages: ChatTurn[] } {
  const msgs = (input as { messages?: unknown })?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_TURNS) {
    throw new Error("Requête invalide : messages manquants ou trop nombreux.");
  }
  const messages = msgs.map((m) => {
    const role = (m as ChatTurn)?.role;
    const content = (m as ChatTurn)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.length > MAX_CHARS) {
      throw new Error("Requête invalide : message mal formé.");
    }
    return { role, content };
  });
  return { messages };
}

/** Secure backend entry point for the chat. Returns an explicit status when no model is wired. */
export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator(validateChatInput)
  .handler(async ({ data }): Promise<ChatResult> => {
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
    try {
      const res = await provider.complete({ messages: data.messages, task: "chat" });
      return { ok: true, text: res.text, provider: provider.label, model: res.model };
    } catch {
      return { ok: false, code: "provider_error", message: "Le fournisseur IA a renvoyé une erreur." };
    }
  });
