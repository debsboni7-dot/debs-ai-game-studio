import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/lib/ai/registry.server";
import { getRequest } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        // Read secrets inside the request handler: Lovable injects them at Worker runtime.
        const geminiApiKey = getServerEnv("GEMINI_API_KEY");
        const request = getRequest() as Request & { runtime?: { cloudflare?: { env?: Record<string, string | undefined> } } };
        const runtimeEnv = request.runtime?.cloudflare?.env;
        const debsConfigured = Boolean(
          getServerEnv("DEBS_INFERENCE_BASE_URL") && getServerEnv("DEBS_INFERENCE_API_KEY"),
        );
        const geminiConfigured = Boolean(geminiApiKey);
        const activeProvider = geminiConfigured ? "Gemini" : debsConfigured ? "DEBS Server" : "none";
        const model = geminiConfigured
          ? getServerEnv("GEMINI_MODEL") || "gemini-2.5-flash"
          : debsConfigured
            ? getServerEnv("DEBS_MODEL") || "qwen2.5:3b"
            : null;
        return Response.json(
          {
            activeProvider,
            geminiConfigured,
            debsConfigured,
            runtimeBindingAvailable: Boolean(runtimeEnv),
            runtimeGeminiConfigured: Boolean(runtimeEnv?.GEMINI_API_KEY?.trim()),
            processGeminiConfigured: Boolean(process.env["GEMINI_API_KEY"]?.trim()),
            model,
            fallbackProviders: geminiConfigured && debsConfigured ? ["DEBS Server"] : [],
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
