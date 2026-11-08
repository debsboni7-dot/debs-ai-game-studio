import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        // Report configuration presence only. Never expose API keys or secret values.
        const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
        const debsConfigured = Boolean(
          process.env.DEBS_INFERENCE_BASE_URL?.trim() && process.env.DEBS_INFERENCE_API_KEY?.trim(),
        );
        const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
        const debsModel = process.env.DEBS_MODEL?.trim() || "qwen2.5:3b";
        const activeProvider = geminiConfigured ? "Gemini" : debsConfigured ? "DEBS Server" : "none";
        const model = geminiConfigured ? geminiModel : debsConfigured ? debsModel : null;
        return Response.json(
          {
            activeProvider,
            geminiConfigured,
            geminiModel: geminiConfigured ? geminiModel : null,
            debsConfigured,
            model,
            fallbackProviders: [],
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
