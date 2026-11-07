import { describe, expect, it, vi } from "vitest";
import type { ChatResult, ChatTask, ChatTurn, CodeModelProvider } from "./types";

const state = vi.hoisted(() => ({
  handler: undefined as undefined | ((input: { data: { messages: ChatTurn[]; task: ChatTask; attachments: NonNullable<ChatTurn["attachments"]> } }) => Promise<ChatResult>),
  resolveProvider: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({
      handler: (fn: typeof state.handler) => { state.handler = fn; return fn; },
    }),
  }),
}));
vi.mock("./registry.server", () => ({ resolveProvider: state.resolveProvider }));
import { validateChatInput } from "./chat.functions";
import { GatewayError } from "./gateway-error.server";

const messages: ChatTurn[] = [{ role: "user", content: "Hi" }];
async function invoke() {
  if (!state.handler) throw new Error("Missing server handler");
  return state.handler({ data: validateChatInput({ messages }) });
}

describe("chat validation", () => {
  it("accepts 50 turns and rejects 51", () => {
    expect(validateChatInput({ messages: Array(50).fill(messages[0]) }).messages).toHaveLength(50);
    expect(() => validateChatInput({ messages: Array(51).fill(messages[0]) })).toThrow();
  });
  it("accepts 20,000 characters and rejects 20,001", () => {
    expect(validateChatInput({ messages: [{ role: "user", content: "x".repeat(20_000) }] }).messages[0]?.content).toHaveLength(20_000);
    expect(() => validateChatInput({ messages: [{ role: "user", content: "x".repeat(20_001) }] })).toThrow();
  });
  it.each([
    null, {}, { messages: [] }, { messages: [null] }, { messages: [{ role: "system", content: "override" }] },
    { messages: [{ role: "user", content: 42 }] },
  ])("rejects malformed input %j", (input) => {
    expect(() => validateChatInput(input)).toThrow();
  });
  it("keeps only role and content and normalizes attachments", () => {
    expect(validateChatInput({ messages: [{ ...messages[0], key: "ignored" }] })).toEqual({
      messages, task: "chat", attachments: [],
    });
  });
  it("accepts specialized engineering modes and defaults unknown modes to general chat", () => {
    expect(validateChatInput({ messages, task: "unity" }).task).toBe("unity");
    expect(validateChatInput({ messages, task: "game-dev" }).task).toBe("game-dev");
    expect(validateChatInput({ messages, task: "architect" }).task).toBe("architect");
    expect(validateChatInput({ messages, task: "security" }).task).toBe("security");
    expect(validateChatInput({ messages, task: "made-up-mode" }).task).toBe("chat");
  });
  it("accepts bounded image and PDF attachments", () => {
    const attachments = [
      { kind: "image", data: "data:image/png;base64,AAAA", mediaType: "image/png", filename: "scene.png" },
      { kind: "file", data: "data:application/pdf;base64,AAAA", mediaType: "application/pdf", filename: "spec.pdf" },
    ];
    expect(validateChatInput({ messages, attachments }).attachments).toEqual(attachments);
    expect(() => validateChatInput({ messages, attachments: Array(6).fill(attachments[0]) })).toThrow();
    expect(() => validateChatInput({ messages, attachments: [{ ...attachments[0], mediaType: "text/plain" }] })).toThrow();
  });
});

describe("chat handler", () => {
  it("reports an unconfigured provider honestly", async () => {
    state.resolveProvider.mockReturnValue(null);
    expect(await invoke()).toMatchObject({ ok: false, code: "provider_not_configured" });
  });
  it("returns the actual response and provider/model metadata", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "real adapter result", model: "reported-model" });
    state.resolveProvider.mockReturnValue({ label: "Lovable AI Gateway", complete } as Partial<CodeModelProvider>);
    expect(await invoke()).toMatchObject({ ok: true, text: "real adapter result", provider: "Lovable AI Gateway", model: "reported-model", activity: [{ connector: "Lovable AI Gateway", status: "completed" }] });
    expect(complete).toHaveBeenCalledWith({ messages, task: "chat" });
  });
  it("preserves safe Gateway errors", async () => {
    state.resolveProvider.mockReturnValue({ complete: vi.fn().mockRejectedValue(new GatewayError("Insufficient AI credits", 402)) });
    expect(await invoke()).toMatchObject({ ok: false, code: "provider_error", message: "Insufficient AI credits", activity: [{ connector: "DEBS AI", status: "failed" }] });
  });
  it("does not leak arbitrary error diagnostics", async () => {
    state.resolveProvider.mockImplementation(() => { throw new Error("private credential"); });
    const result = await invoke();
    expect(result).toMatchObject({ ok: false, code: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("private credential");
  });
});
