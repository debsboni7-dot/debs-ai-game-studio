import { createFileRoute } from "@tanstack/react-router";
import { validateChatInput } from "@/lib/ai/chat.functions";
import { streamChatResponse } from "@/lib/ai/registry.server";

export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = await request.json();
          const data = validateChatInput(input);
          return streamChatResponse({ messages: data.attachments.length
            ? data.messages.map((message, index) => index === data.messages.length - 1
              ? { ...message, attachments: data.attachments }
              : message)
            : data.messages, task: data.task }, request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Requête invalide.";
          return Response.json({ message }, { status: 400 });
        }
      },
    },
  },
});
