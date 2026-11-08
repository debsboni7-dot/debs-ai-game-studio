import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string; apiMode?: "responses" | "chat" },
  messages: ModelMessage[],
  instructions?: string,
  enableWebSearch = false,
  reasoningEffort: "low" | "medium" | "high" = "medium",
  enableAssetImport = false,
) {
  const gatewayBaseURL = config.baseURL.endsWith("/v1") ? config.baseURL.slice(0, -3) : config.baseURL.endsWith("/") ? config.baseURL.slice(0, -1) : config.baseURL;
  const provider = createOpenAI({
    baseURL: config.apiMode === "chat" ? config.baseURL : `${gatewayBaseURL}/v1`,
    apiKey: config.apiKey,
    headers: {},
  });
  const reasoning = config.apiMode !== "chat" && config.model !== "openai/chat-latest";

  const callWebSearch = async (input: { query: string; limit?: number; language?: string }) => {
    try {
      const response = await fetch(config.baseURL.replace(/\\/+$/, "") + "/search", {
        method: "POST",
        headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query: input.query, limit: input.limit ?? 6, language: input.language ?? "all" }),
        signal: request.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: String(result.detail ?? result.error ?? "La recherche DEBS est indisponible.").slice(0, 400) };
      return result;
    } catch {
      return { ok: false, error: "Le moteur de recherche DEBS est inaccessible pour le moment." };
    }
  };

  const webSearch = enableWebSearch ? tool({
    description: "Rechercher des informations actuelles sur Internet via le moteur de recherche autonome SearXNG hébergé avec DEBS. Utilise cet outil pour les demandes explicites de recherche, les informations récentes, les documentations et pour trouver des pages officielles de ressources. Retourne des titres, extraits et URL de sources HTTPS. Ne prétends jamais avoir ouvert une page complète : les extraits sont des résumés du moteur.",
    inputSchema: z.object({
      query: z.string().min(2).max(400),
      limit: z.number().int().min(1).max(10).optional(),
      language: z.string().max(12).optional(),
    }),
    execute: callWebSearch,
  }) : undefined;

  const callChatFiles = async (input: {
    action: "generate" | "download";
    filename: string;
    content_type?: string;
    content?: string;
    base64?: string;
    source_url?: string;
  }) => {
    const authorization = request.headers.get("authorization");
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (!authorization || !supabaseUrl || !anonKey) {
      return { ok: false, error: "Fichiers du chat indisponibles : session utilisateur ou configuration Supabase manquante." };
    }
    try {
      const response = await fetch((supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl) + "/functions/v1/chat-files", {
        method: "POST",
        headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: request.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, error: String(result.error ?? "Le service de fichiers a refusé la demande.").slice(0, 500) };
      return result;
    } catch {
      return { ok: false, error: "Le service de fichiers est inaccessible pour le moment." };
    }
  };

  const createChatFile = tool({
    description: "Créer un vrai fichier téléchargeable directement dans la conversation, sans GitHub. À utiliser lorsque l'utilisateur demande de produire, générer ou fournir un fichier. Fournis le contenu texte dans content ou les octets encodés en base64 dans base64. Formats pris en charge : code et documents texte, images, sons, vidéos, modèles 3D et autres formats de ressources autorisés. Limite 15 Mo. Après réussite, donne le lien download_url dans la réponse finale Markdown.",
    inputSchema: z.object({
      filename: z.string().min(1).max(120),
      content_type: z.string().max(120).optional(),
      content: z.string().max(15_000_000).optional(),
      base64: z.string().max(21_000_000).optional(),
    }).refine((value) => Boolean(value.content) !== Boolean(value.base64), {
      message: "Fournir exactement un des champs content ou base64.",
    }),
    execute: async (input) => callChatFiles({ action: "generate", ...input }),
  });

  const downloadChatFile = tool({
    description: "Télécharger un fichier public depuis une URL HTTPS et le joindre directement à la conversation, sans GitHub ni Pull Request. À utiliser pour les demandes explicites de téléchargement de fichiers individuels (photo, texture, son, vidéo, document, modèle 3D, etc.). Il faut une URL directe vers un fichier public, pas une page de catalogue. Ne contourne jamais les connexions, paywalls, DRM ou protections anti-bot. Respecte les licences et cite la source dans la réponse finale. Limite 15 Mo. Après réussite, donne le lien download_url dans la réponse finale Markdown.",
    inputSchema: z.object({
      source_url: z.string().url().startsWith("https://"),
      filename: z.string().min(1).max(120).optional(),
      content_type: z.string().max(120).optional(),
    }),
    execute: async (input) => callChatFiles({ action: "download", filename: input.filename ?? "", ...input }),
  });

  const importGameAssets = enableAssetImport ? tool({
    description: "Intégrer un pack de ressources de jeu dans le dépôt GitHub de l'utilisateur. À utiliser uniquement si l'utilisateur a explicitement demandé d'intégrer les assets dans son projet ou son dépôt. Pour un simple téléchargement dans le chat, utilise download_chat_file à la place. Recherche sur tout site public pertinent, sans liste blanche de domaines. Vérifie la licence exacte sur une source officielle. N'essaie pas de contourner les connexions, paywalls, DRM ou protections anti-bot. Crée une Pull Request brouillon, sans fusion automatique.",
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
      if (!authorization || !supabaseUrl || !anonKey) return { ok: false, error: "Import GitHub indisponible : session ou configuration manquante." };
      try {
        const response = await fetch((supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl) + "/functions/v1/asset-import", {
          method: "POST",
          headers: { Authorization: authorization, apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: request.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) return { ok: false, error: String(result.error ?? "Le service d'import a refusé la demande.").slice(0, 500) };
        return result;
      } catch {
        return { ok: false, error: "Le service d'import GitHub est inaccessible pour le moment." };
      }
    },
  }) : undefined;

  const tools = {
    ...(webSearch ? { web_search: webSearch } : {}),
    create_chat_file: createChatFile,
    download_chat_file: downloadChatFile,
    ...(importGameAssets ? { import_game_assets: importGameAssets } : {}),
  };
  const result = streamText({
    model: config.apiMode === "chat" ? provider.chat(config.model) : provider.responses(config.model),
    ...(instructions ? { instructions } : {}),
    messages,
    tools,
    toolChoice: "auto" as const,
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
    response: () => result.toUIMessageStreamResponse({ sendReasoning: true }),
  };
}
