import type { CodeModelProvider } from "./types";
import { createResponsesCall } from "./responses.server";
import { GatewayError, safeGatewayError } from "./gateway-error.server";

const MODEL = "openai/gpt-6-astra";

/** Credentials and SDK clients are created per call, never sent to the browser. */
const lovableProvider: CodeModelProvider = {
  id: "lovable-ai",
  label: "Lovable AI Gateway",
  isConfigured: () => Boolean(process.env.LOVABLE_API_KEY?.trim()),
  async complete(req, signal) {
    const apiKey = process.env.LOVABLE_API_KEY?.trim();
    if (!apiKey) throw new GatewayError("Lovable AI n'est pas configuré sur le serveur.");
    const messages = req.messages.map((message) => {
      if (message.role === "system")
        throw new GatewayError("Les instructions système ne sont pas acceptées dans l'historique.");
      return { role: message.role, content: message.content };
    });
    try {
      const request = new Request("https://debs.internal/chat", signal ? { signal } : undefined);
      const modeInstructions: Record<NonNullable<typeof req.task>, string> = {
        chat: "Answer as a general assistant. Handle the user's message naturally; do not assume it is a coding request.",
        code: "Prioritize programming, architecture, implementation, readable code, and practical engineering explanations.",
        search: "The user requested research. You do not have a web-search tool in this runtime. Never pretend to browse, cite invented sources, or present current facts as verified. Explain this limitation and answer only from reliable knowledge, clearly marking uncertainty.",
        "game-design": "Prioritize game design: core loop, mechanics, progression, balancing, level design, player experience, and production scope.",
        debug: "Act as a debugging specialist. Identify likely causes, ask for missing logs or reproduction steps when essential, and propose minimal, testable fixes. Never claim to have run the code.",
        review: "Perform a code review. Prioritize correctness, security, regressions, performance, and maintainability. List findings by severity and cite file/line only when supplied by the user.",
      };
      const task = req.task ?? "chat";
      const { result } = createResponsesCall(
        request,
        { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: MODEL },
        messages,
        `You are DEBS AI, an assistant for creating video games and software. Answer in the user's language. Be accurate, useful, and concise. ${modeInstructions[task]} Never claim to have executed code, edited files, browsed the web, or connected tools unless the runtime actually confirms it. Clearly distinguish examples from verified results.`,
      );
      // Consume the real stream on the server; the existing UI keeps its final-only contract.
      let streamError: unknown;
      for await (const part of result.fullStream) {
        if (part.type === "error") streamError = part.error;
      }
      if (streamError) throw streamError;
      const text = await result.text;
      if (!text.trim())
        throw new GatewayError(
          "Lovable AI n'a renvoyé aucun texte (réponse vide ou refus). Aucun nouvel essai automatique n'a été effectué.",
        );
      const response = await result.response;
      return { text, model: response.modelId };
    } catch (error) {
      throw safeGatewayError(error);
    }
  },
};

const adapters: CodeModelProvider[] = [lovableProvider];

export function resolveProvider(): CodeModelProvider | null {
  return adapters.find((a) => a.isConfigured()) ?? null;
}
