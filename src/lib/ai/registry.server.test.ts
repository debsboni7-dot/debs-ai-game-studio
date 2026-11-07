import { afterEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

const state = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./responses.server", () => ({ createResponsesCall: state.call }));
import { resolveProvider } from "./registry.server";
import { safeGatewayError } from "./gateway-error.server";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const input = { messages: [{ role: "user" as const, content: "Hi" }] };
function configuredProvider() {
  vi.stubEnv("LOVABLE_API_KEY", "test-only-key");
  const provider = resolveProvider();
  if (!provider) throw new Error("Expected configured provider");
  return provider;
}
function result(text: string, error?: unknown) {
  return { result: {
    fullStream: (async function* () { if (error) yield { type: "error", error }; })(),
    text: Promise.resolve(text), response: Promise.resolve({ modelId: "actual-upstream-model" }),
  } };
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
    expect(await provider.complete(input)).toEqual({ text: "Hello", model: "actual-upstream-model" });
    expect(state.call.mock.calls[0]?.[1]).toEqual({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: "test-only-key", model: "openai/gpt-6-astra" });
    expect(state.call.mock.calls[0]?.[2]).toEqual(input.messages);
    expect(state.call).toHaveBeenCalledTimes(1);
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
    const error = new APICallError({ message: "SDK diagnostics", url: "https://ai.gateway.lovable.dev/v1/responses", requestBodyValues: {}, statusCode: 403, responseBody: JSON.stringify({ message: "Denied test-only-key" }), isRetryable: false });
    const safe = safeGatewayError(error);
    expect(safe.status).toBe(403);
    expect(safe.message).toBe("Denied [secret masqué]");
  });
});