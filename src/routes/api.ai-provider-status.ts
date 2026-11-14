import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/lib/ai/registry.server";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        // Read secrets inside the request handler: Lovable injects them at Worker runtime.
        const geminiApiKey = getServerEnv("GEMINI_API_KEY");
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
            model,
            fallbackProviders: geminiConfigured && debsConfigured ? ["DEBS Server"] : [],
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
