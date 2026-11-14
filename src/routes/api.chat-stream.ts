import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { validateChatInput } from "@/lib/ai/chat.functions";
import { streamChatResponse } from "@/lib/ai/registry.server";

export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authorization = request.headers.get("authorization");
          const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
          if (!token || token.split(".").length !== 3) {
            return Response.json({ message: "Connexion requise." }, { status: 401 });
          }
          const supabaseUrl = process.env["SUPABASE_URL"];
          const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (!supabaseUrl || !supabaseKey) {
            return Response.json({ message: "Service d'authentification indisponible." }, { status: 503 });
          }
          const authClient = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: userData, error: userError } = await authClient.auth.getUser(token);
          if (userError || !userData.user) {
            return Response.json({ message: "Session invalide. Reconnecte-toi." }, { status: 401 });
          }
          if (!userData.user.email_confirmed_at) {
            return Response.json({ message: "Adresse e-mail non vérifiée." }, { status: 403 });
          }
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
