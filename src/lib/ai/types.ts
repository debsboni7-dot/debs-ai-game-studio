/** Provider-agnostic contract for code models. Adapters live server-side only. */
export type ChatRole = "user" | "assistant" | "system";
export type ChatTask = "chat" | "code" | "search" | "game-design" | "debug" | "review" | "github" | "unity" | "unreal" | "godot" | "blender" | "threejs" | "architect" | "test" | "refactor" | "security" | "performance" | "api" | "devops";

export interface ChatActivityEvent {
  id: string;
  connector: string;
  action: string;
  status: "completed" | "failed" | "running";
  summary: string;
  urls?: string[];
  durationMs?: number;
}

export interface ChatTurn {
  role: ChatRole;
  content: string;
  attachments?: { kind: "image" | "file"; data: string; mediaType: string; filename: string }[];
}

export interface CodeModelRequest {
  messages: ChatTurn[];
  task?: ChatTask;
}

export interface CodeModelProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  complete(req: CodeModelRequest, signal?: AbortSignal): Promise<{ text: string; model: string; activity?: ChatActivityEvent[] }>;
}

export type ChatResult =
  | { ok: true; text: string; provider: string; model: string; activity: ChatActivityEvent[] }
  | { ok: false; code: "provider_not_configured" | "invalid_request" | "provider_error"; message: string; activity?: ChatActivityEvent[] };
