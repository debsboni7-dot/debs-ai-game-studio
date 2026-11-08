import { afterEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./responses.server", () => ({ createResponsesCall: state.call }));
import { resolveProvider, streamChatResponse } from "./registry.server";
import { safeGatewayError } from "./gateway-error.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const input = { messages: [{ role: "user" as const, content: "Hi" }] };
function configuredProvider() {
  vi.stubEnv("LOVABLE_API_KEY", "test-only-key");
  const provider = resolveProvider();
  if (!provider) throw new Error("Expected configured provider");
  return provider;
}
function result(text: string, error?: unknown) {
  return {
    result: {
      fullStream: (async function* () {
        if (error) yield { type: "error", error };
      })(),
      text: Promise.resolve(text),
      response: Promise.resolve({ modelId: "actual-upstream-model" }),
    },
  };
}

describe("managed Gateway adapter", () => {
  it.each(["", "   "])("is unconfigured without a usable managed key", (key) => {
    vi.stubEnv("LOVABLE_API_KEY", key);
    expect(resolveProvider()).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
  });
  it("uses the managed Gateway and reports upstream metadata", async () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("Hello"));
    expect(await provider.complete(input)).toEqual({
      text: "Hello",
      model: "actual-upstream-model",
      activity: [],
    });
    expect(state.call.mock.calls[0]?.[1]).toEqual({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: "test-only-key",
      model: "openai/gpt-6-astra",
      label: "Lovable AI Gateway",
      apiMode: "responses",
    });
    expect(state.call.mock.calls[0]?.[2]).toEqual(input.messages);
    expect(state.call).toHaveBeenCalledTimes(1);
  });

  it("keeps creator identity consistent in normal and streamed prompts", () => {
    configuredProvider();
    state.call.mockReturnValue(result("Hello"));
    const provider = resolveProvider();
    if (!provider) throw new Error("Expected configured provider");
    void provider.complete(input);
    const normalPrompt = state.call.mock.calls[0]?.[3] as string;
    expect(normalPrompt).toContain("Mon créateur est Debs Boni. J’ai été développé par DEBS AI Studio.");

    state.call.mockClear();
    streamChatResponse(input as never, new Request("https://debs.internal/chat"));
    const streamedPrompt = state.call.mock.calls[0]?.[3] as string;
    expect(streamedPrompt).toContain("Mon créateur est Debs Boni. J’ai été développé par DEBS AI Studio.");
  });
  it("gives game-development mode the expanded browser evidence workflow", () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("Ready"));
    void provider.complete({ ...input, task: "game-dev" });
    const prompt = state.call.mock.calls[0]?.[3] as string;
    expect(prompt).toContain("debs-browser-runtime-evidence");
    expect(prompt).toContain("mobile touch emulation");
    expect(prompt).toContain("JSON and Markdown reports");
  });
  it("rejects empty output without fabricated answers or retries", async () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("  "));
    await expect(provider.complete(input)).rejects.toThrow("aucun texte");
    expect(state.call).toHaveBeenCalledTimes(1);
  });
  it("reports stream failures without a retry", async () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("", new Error("private SDK details")));
    await expect(provider.complete(input)).rejects.toThrow("Aucun nouvel essai automatique");
    expect(state.call).toHaveBeenCalledTimes(1);
  });
  it("redacts the managed credential from a safe upstream error", () => {
    configuredProvider();
    const error = new APICallError({
      message: "SDK diagnostics",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      requestBodyValues: {},
      statusCode: 403,
      responseBody: JSON.stringify({ message: "Denied test-only-key" }),
      isRetryable: false,
    });
    const safe = safeGatewayError(error);
    expect(safe.status).toBe(403);
    expect(safe.message).toBe("Denied [secret masqué]");
  });
});
