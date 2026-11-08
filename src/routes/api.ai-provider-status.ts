import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
        const lovableConfigured = Boolean(process.env.LOVABLE_API_KEY?.trim());
        const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
        return Response.json(
          {
            activeProvider: geminiConfigured
              ? "Google Gemini"
              : lovableConfigured
                ? "Lovable AI Gateway"
                : "none",
            geminiConfigured,
            lovableConfigured,
            model: geminiConfigured ? geminiModel : lovableConfigured ? "openai/gpt-6-astra" : null,
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
