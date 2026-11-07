import { createServerFn } from "@tanstack/react-start";
import type { ChatResult, ChatTurn } from "./types";

const MAX_TURNS = 50;
const MAX_CHARS = 20_000;
const TASKS = ["chat", "code", "search", "game-design", "debug", "review"] as const;

export function validateChatInput(input: unknown): { messages: ChatTurn[]; task: (typeof TASKS)[number]; attachments: NonNullable<ChatTurn["attachments"]> } {
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
  const attachmentsRaw = (input as { attachments?: unknown })?.attachments;
  const attachments = attachmentsRaw === undefined ? [] : attachmentsRaw;
  if (!Array.isArray(attachments) || attachments.length > 5) throw new Error("Pièces jointes invalides ou trop nombreuses.");
  let totalBytes = 0;
  const safeAttachments = attachments.map((item) => {
    const file = item as { kind?: unknown; data?: unknown; mediaType?: unknown; filename?: unknown };
    if ((file.kind !== "image" && file.kind !== "file") || typeof file.data !== "string" ||
      file.data.length > 11_200_000 || typeof file.mediaType !== "string" || typeof file.filename !== "string" ||
      (file.kind === "image" && !file.mediaType.startsWith("image/")) ||
      (file.kind === "file" && file.mediaType !== "application/pdf") ||
      !file.data.startsWith("data:")) throw new Error("Type ou taille de pièce jointe non autorisé.");
    totalBytes += file.data.length;
    return { kind: file.kind, data: file.data, mediaType: file.mediaType, filename: file.filename };
  });
  if (totalBytes > 21_000_000) throw new Error("Les pièces jointes dépassent la limite totale autorisée.");
  const requestedTask = (input as { task?: unknown })?.task;
  const task = TASKS.includes(requestedTask as (typeof TASKS)[number]) ? requestedTask as (typeof TASKS)[number] : "chat";
  return { messages, task, attachments: safeAttachments };
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
      const res = await provider.complete({ messages: data.messages.map((message, index) => index === data.messages.length - 1 ? { ...message, attachments: data.attachments } : message), task: data.task ?? "chat" });
      return { ok: true, text: res.text, provider: provider.label, model: res.model };
    } catch (error) {
      const { safeGatewayError } = await import("./gateway-error.server");
      return { ok: false, code: "provider_error", message: safeGatewayError(error).message };
    }
  });
