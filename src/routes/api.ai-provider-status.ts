import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        // Read secrets inside the request handler: Lovable injects them at Worker runtime.
        const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
        const debsConfigured = Boolean(
          process.env.DEBS_INFERENCE_BASE_URL?.trim() && process.env.DEBS_INFERENCE_API_KEY?.trim(),
        );
        const geminiConfigured = Boolean(geminiApiKey);
        const activeProvider = geminiConfigured ? "Gemini" : debsConfigured ? "DEBS Server" : "none";
        const model = geminiConfigured
          ? process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"
          : debsConfigured
            ? process.env.DEBS_MODEL?.trim() || "qwen2.5:3b"
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
