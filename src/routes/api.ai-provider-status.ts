import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        const debsConfigured = Boolean(
          process.env.DEBS_INFERENCE_BASE_URL?.trim() && process.env.DEBS_INFERENCE_API_KEY?.trim(),
        );
        const model = process.env.DEBS_MODEL?.trim() || "qwen2.5:3b";
        return Response.json(
          {
            activeProvider: debsConfigured ? "DEBS Server" : "none",
            debsConfigured,
            model: debsConfigured ? model : null,
            fallbackProviders: [],
          },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      },
    },
  },
});
