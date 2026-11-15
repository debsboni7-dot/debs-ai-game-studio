import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv, streamChatResponse } from "@/lib/ai/registry.server";
import { validateChatInput } from "@/lib/ai/chat.functions";
import { verifyVerifiedEmailBearer, type AuthClientFactory } from "@/lib/auth.server";
import { retrieveDebsMemoryContext } from "@/lib/ai/memory.server";

const createAuthClient: AuthClientFactory = (url, key) =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await verifyVerifiedEmailBearer(
            request,
            getServerEnv("SUPABASE_URL"),
            getServerEnv("SUPABASE_PUBLISHABLE_KEY"),
            createAuthClient,
          );
          if (!auth.ok) {
            return Response.json({ message: auth.message }, { status: auth.status });
          }

          let data: ReturnType<typeof validateChatInput>;
          try {
            data = validateChatInput(await request.json());
          } catch (error) {
            const message = error instanceof Error ? error.message : "Requête invalide.";
            return Response.json({ message }, { status: 400 });
          }
          const token = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
          const memoryClient = createClient(
            getServerEnv("SUPABASE_URL")!,
            getServerEnv("SUPABASE_PUBLISHABLE_KEY")!,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false },
            },
          );
          const memoryContext = await retrieveDebsMemoryContext(memoryClient, auth.identity.userId, data.messages);
          const chatMessages = data.attachments.length
            ? data.messages.map((message, index) => index === data.messages.length - 1
              ? { ...message, attachments: data.attachments }
              : message)
            : data.messages;
          return streamChatResponse({
            messages: memoryContext
              ? [{ role: "system" as const, content: memoryContext }, ...chatMessages]
              : chatMessages,
            task: data.task,
          }, request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erreur interne du serveur.";
          return Response.json({ message }, { status: 500 });
        }
      },
    },
  },
});
