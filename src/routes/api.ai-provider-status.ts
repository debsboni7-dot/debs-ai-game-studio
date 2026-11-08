import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        const debsConfigured = Boolean(
          process.env.DEBS_INFERENCE_BASE_URL?.trim() && process.env.DEBS_INFERENCE_API_KEY?.trim(),
        );
        const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
        const lovableConfigured = Boolean(process.env.LOVABLE_API_KEY?.trim());
        const debsModel = process.env.DEBS_MODEL?.trim() || "qwen2.5:3b";
        const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
        const activeProvider = debsConfigured
          ? "DEBS Self-hosted"
          : geminiConfigured
            ? "Google Gemini"
            : lovableConfigured
              ? "Lovable AI Gateway"
              : "none";
        return Response.json(
          {
            activeProvider,
            debsConfigured,
            geminiConfigured,
            lovableConfigured,
            model: debsConfigured
              ? debsModel
              : geminiConfigured
                ? geminiModel
                : lovableConfigured
                  ? "openai/gpt-6-astra"
                  : null,
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
