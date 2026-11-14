import { createFileRoute } from "@tanstack/react-router";
import { getAIProviderStatus } from "@/lib/ai/registry.server";

export const Route = createFileRoute("/api/ai-provider-status")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(getAIProviderStatus(), {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
