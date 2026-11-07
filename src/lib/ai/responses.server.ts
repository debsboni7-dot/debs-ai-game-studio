import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
  enableWebSearch = false,
  reasoningEffort: "low" | "medium" | "high" = "medium",
  enableAssetImport = false,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\\/+$/, "").replace(/\\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const reasoning = config.model !== "openai/chat-latest";
  const webSearch = enableWebSearch
    ? provider.tools.webSearch({ externalWebAccess: true, searchContextSize: "medium" })
    : undefined;
  const importGameAssets = enableAssetImport ? tool({
    description: "Télécharger et importer un pack de ressources de jeu dans le dépôt GitHub de l'utilisateur. À utiliser uniquement si l'utilisateur a explicitement demandé de télécharger ou intégrer des assets. Tu dois d'abord rechercher une source officielle, vérifier la licence exacte et fournir un lien HTTPS direct vers une archive ZIP. Ne jamais inventer le lien ni la licence. La fonction crée une branche et une Pull Request brouillon, sans fusion automatique.",
    inputSchema: z.object({
      pack_name: z.string().min(2).max(100),
      source_url: z.string().url().startsWith("https://"),
      license_name: z.string().min(2).max(80),
      license_url: z.string().url().startsWith("https://"),
      license_evidence: z.string().min(20).max(1200),
    }),
    execute: async (input) => {
      const authorization = request.headers.get("authorization");
      const supabaseUrl = process.env.SUPABASE_URL?.trim();
      const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
      if (!authorization || !supabaseUrl || !anonKey) {
        return { ok: false, error: "Import non disponible : session utilisateur ou configuration Supabase manquante." };
      }
      try {
        const response = await fetch(supabaseUrl.replace(/\\/+$/, "") + "/functions/v1/asset-import", {
          method: "POST",
          headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: request.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: String(result.error ?? "Le service d'import a refusé la demande.").slice(0, 500) };
        return result;
      } catch {
        return { ok: false, error: "Le service d'import est inaccessible pour le moment." };
      }
    },
  }) : undefined;
  const tools = {
    ...(webSearch ? { web_search: webSearch } : {}),
    ...(importGameAssets ? { import_game_assets: importGameAssets } : {}),
  };
  const result = streamText({
    model: provider.responses(config.model),
    ...(instructions ? { instructions } : {}),
    messages,
    ...(Object.keys(tools).length ? { tools, toolChoice: "auto" as const } : {}),
    abortSignal: request.signal,
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort,
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    response: () =>
      withLovableAiGatewayRunIdHeader(
        result.toUIMessageStreamResponse({ sendReasoning: true }),
        runIdFetch,
      ),
  };
}
