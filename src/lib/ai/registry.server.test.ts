import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./responses.server", () => ({ createResponsesCall: state.call }));
import { getAIProviderStatus, resolveProvider, streamChatResponse } from "./registry.server";
import { safeGatewayError } from "./gateway-error.server";

beforeEach(() => {
  for (const name of [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "LOVABLE_API_KEY",
    "DEBS_INFERENCE_BASE_URL",
    "DEBS_INFERENCE_API_KEY",
    "DEBS_MODEL",
  ])
    vi.stubEnv(name, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const input = { messages: [{ role: "user" as const, content: "Hi" }] };
function configuredProvider() {
  vi.stubEnv("DEBS_INFERENCE_BASE_URL", "http://debs-server:8080/v1");
  vi.stubEnv("DEBS_INFERENCE_API_KEY", "test-only-key");
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

describe("DEBS self-hosted adapter", () => {
  it.each(["", "   "])("is unconfigured without a DEBS server key", (key) => {
    vi.stubEnv("DEBS_INFERENCE_BASE_URL", "http://debs-server:8080/v1");
    vi.stubEnv("DEBS_INFERENCE_API_KEY", key);
    expect(resolveProvider()).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
  });
  it("makes the self-hosted web search tool available to coding tasks", async () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("Found useful sources."));
    await provider.complete({ ...input, task: "code" });
    expect(state.call.mock.calls[0]?.[4]).toBe(true);
  });

  it("uses only the DEBS server and reports upstream metadata", async () => {
    const provider = configuredProvider();
    state.call.mockReturnValue(result("Hello"));
    expect(await provider.complete(input)).toEqual({
      text: "Hello",
      model: "actual-upstream-model",
      activity: [],
    });
    expect(state.call.mock.calls[0]?.[1]).toEqual({
      baseURL: "http://debs-server:8080/v1",
      apiKey: "test-only-key",
      model: "qwen2.5:3b",
      label: "DEBS Server",
      apiMode: "chat",
      searchBaseURL: "http://debs-server:8080/v1",
      searchApiKey: "test-only-key",
    });
    expect(state.call.mock.calls[0]?.[2]).toEqual(input.messages);
    expect(state.call).toHaveBeenCalledTimes(1);
  });

  it("prefers Gemini when the user Gemini API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    const provider = resolveProvider();
    if (!provider) throw new Error("Expected configured provider");
    state.call.mockReturnValue(result("Hello from Gemini"));
    await provider.complete(input);
    expect(provider.label).toBe("Gemini");
    expect(state.call.mock.calls[0]?.[1]).toEqual({
      label: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: "gemini-test-key",
      model: "gemini-2.5-flash",
      apiMode: "chat",
    });
    expect(getAIProviderStatus()).toMatchObject({
      activeProvider: "Gemini",
      model: "gemini-2.5-flash",
      geminiConfigured: true,
      lovableConfigured: false,
    });
  });

  it("prefers managed Lovable AI and reports its real configuration", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "lovable-test-key");
    configuredProvider();
    const provider = resolveProvider();
    if (!provider) throw new Error("Expected configured provider");
    state.call.mockReturnValue(result("Hello"));
    await provider.complete(input);
    expect(provider.label).toBe("Lovable AI");
    expect(state.call.mock.calls[0]?.[1]).toEqual({
      label: "Lovable AI",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: "lovable-test-key",
      model: "openai/gpt-6-astra",
      apiMode: "responses",
    });
    expect(getAIProviderStatus()).toEqual({
      activeProvider: "Lovable AI",
      model: "openai/gpt-6-astra",
      geminiConfigured: false,
      lovableConfigured: true,
      debsConfigured: true,
      fallbackProviders: ["DEBS Server"],
    });
  });
  it("does not fall back after a managed Gateway denial and redacts its credential", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "lovable-test-key");
    const provider = configuredProvider();
    const error = new APICallError({
      message: "SDK diagnostics",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      requestBodyValues: {},
      statusCode: 403,
      responseBody: JSON.stringify({ message: "Denied lovable-test-key" }),
      isRetryable: false,
    });
    state.call.mockReturnValue(result("", error));
    await expect(provider.complete(input)).rejects.toMatchObject({
      status: 403,
      message: "Denied [secret masqué]",
    });
    expect(state.call).toHaveBeenCalledTimes(1);
  });
  it("retains the existing self-hosted configuration fallback", () => {
    expect(configuredProvider().label).toBe("DEBS Server");
  });
  it("keeps creator identity consistent in normal and streamed prompts", () => {
    configuredProvider();
    state.call.mockReturnValue(result("Hello"));
    const provider = resolveProvider();
    if (!provider) throw new Error("Expected configured provider");
    void provider.complete(input);
    const normalPrompt = state.call.mock.calls[0]?.[3] as string;
    expect(normalPrompt).toContain(
      "Mon créateur est Debs Boni. J’ai été développé par DEBS AI Studio.",
    );

    state.call.mockClear();
    streamChatResponse(input as never, new Request("https://debs.internal/chat"));
    const streamedPrompt = state.call.mock.calls[0]?.[3] as string;
    expect(streamedPrompt).toContain(
      "Mon créateur est Debs Boni. J’ai été développé par DEBS AI Studio.",
    );
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
  it("redacts the DEBS server credential from an upstream error", () => {
    configuredProvider();
    const error = new APICallError({
      message: "SDK diagnostics",
      url: "http://debs-server:8080/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 403,
      responseBody: JSON.stringify({ message: "Denied test-only-key" }),
      isRetryable: false,
    });
    const safe = safeGatewayError(error);
    expect(safe.status).toBe(403);
    expect(safe.message).toBe("Denied [secret masqué]");
  });

  it("returns a clear 503 instead of falling back when the DEBS server is unavailable", async () => {
    const response = streamChatResponse(input as never, new Request("https://debs.internal/chat"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "Lovable AI n'est pas configuré : la clé gérée côté serveur est manquante.",
    });
    expect(state.call).not.toHaveBeenCalled();
  });

  it("streams real-model text, activity and completion metadata as NDJSON", async () => {
    configuredProvider();
    state.call.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield { type: "text-delta", text: "Salut" };
          yield { type: "text-delta", text: " !" };
        })(),
        text: Promise.resolve("Salut !"),
        response: Promise.resolve({ modelId: "qwen2.5:3b" }),
      },
    });

    const response = streamChatResponse(input as never, new Request("https://debs.internal/chat"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events).toContainEqual(expect.objectContaining({ type: "text", delta: "Salut" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "text", delta: " !" }));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "activity",
        event: expect.objectContaining({ id: "model", status: "running" }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "activity",
        event: expect.objectContaining({ id: "model", status: "completed" }),
      }),
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      model: "qwen2.5:3b",
      provider: "DEBS Server",
    });
  });

  it("streams a sanitized error event when inference fails", async () => {
    configuredProvider();
    state.call.mockReturnValue(result("", new Error("private runtime diagnostics")));
    const response = streamChatResponse(input as never, new Request("https://debs.internal/chat"));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toEqual({
      type: "error",
      message:
        "Impossible d'obtenir une réponse du serveur DEBS. Aucun nouvel essai automatique n'a été effectué.",
    });
    expect(JSON.stringify(events)).not.toContain("private runtime diagnostics");
  });
});
