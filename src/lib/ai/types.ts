/**
 * Provider-agnostic contract for code models. Adapters live server-side only
 * (see registry.server.ts) so no key ever reaches the browser.
 */
export type ChatRole = "user" | "assistant" | "system";

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface CodeModelRequest {
  messages: ChatTurn[];
  /** Optional task hint so adapters can pick a prompt/model (chat, code review, game design...). */
  task?: "chat" | "code" | "game-spec";
}

export interface CodeModelProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  complete(req: CodeModelRequest, signal?: AbortSignal): Promise<{ text: string; model: string }>;
}

export type ChatResult =
  | { ok: true; text: string; provider: string; model: string }
  | {
      ok: false;
      code: "provider_not_configured" | "invalid_request" | "provider_error";
      message: string;
    };
