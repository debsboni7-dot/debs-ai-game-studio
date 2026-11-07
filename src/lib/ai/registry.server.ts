import type { CodeModelProvider } from "./types";
import { createResponsesCall } from "./responses.server";
import { GatewayError, safeGatewayError } from "./gateway-error.server";

const MODEL = "openai/gpt-6-astra";
function getLovableApiKey(): string | undefined {
  return process.env.LOVABLE_API_KEY?.trim() || undefined;
}

/** Credentials and SDK clients are created per call, never sent to the browser. */
const lovableProvider: CodeModelProvider = {
  id: "lovable-ai",
  label: "Lovable AI Gateway",
  isConfigured: () => Boolean(getLovableApiKey()),
  async complete(req, signal) {
    const apiKey = getLovableApiKey();
    if (!apiKey) throw new GatewayError("Lovable AI n'est pas configuré sur le serveur.");
    const messages = req.messages.map((message) => {
      if (message.role === "system") throw new GatewayError("Les instructions système ne sont pas acceptées dans l'historique.");
      if (message.role === "user" && message.attachments?.length) {
        const content = [
          { type: "text" as const, text: message.content || "Please inspect the attached file(s)." },
          ...message.attachments.map((file) => file.kind === "image"
            ? { type: "image" as const, image: file.data, mediaType: file.mediaType }
            : { type: "file" as const, data: file.data, mediaType: file.mediaType, filename: file.filename }),
        ];
        return { role: "user" as const, content };
      }
      return { role: message.role, content: message.content };
    });
    try {
      const request = new Request("https://debs.internal/chat", signal ? { signal } : undefined);
      const modeInstructions: Record<NonNullable<typeof req.task>, string> = {
        chat: "Answer as a general assistant. Handle the user's message naturally; do not assume it is a coding request.",
        code: "Act as a senior software engineer. Produce maintainable, typed code, explain architecture and edge cases, and prefer minimal testable changes.",
        search: "The user requested live web research. Use the connected native web_search tool for the query. Base current factual claims on retrieved results, cite source URLs clearly in Markdown, distinguish facts from analysis, and say when reliable sources are unavailable. Never invent sources or claim a search succeeded if the tool fails.",
        "game-design": "Prioritize game design: core loop, mechanics, progression, balancing, level design, player experience, and production scope.",
        debug: "Act as a debugging specialist. Identify likely causes, ask for missing logs or reproduction steps when essential, and propose minimal, testable fixes. Never claim to have run the code.",
        review: "Perform a code review. Prioritize correctness, security, regressions, performance, and maintainability. List findings by severity and cite file/line only when supplied by the user.",
        github: "Act as a GitHub repository engineer. Use the imported repository snapshot as the source of truth. Return proposed changes with exact file paths, a concise rationale, and complete replacement content or a unified diff. The snapshot is read-only: never claim to have committed, pushed, opened a pull request, or changed GitHub.",
        unity: "Act as a senior Unity engineer. Prefer modern Unity C# patterns, MonoBehaviour lifecycle correctness, ScriptableObjects for data, serialized references, prefab/scene workflows, Input System compatibility, Addressables when relevant, and profiling. Include target Unity version assumptions when needed. Do not claim to run the Unity Editor or builds.",
        unreal: "Act as a senior Unreal Engine engineer. Use idiomatic UE C++, UCLASS/USTRUCT/UFUNCTION macros where applicable, reflection and garbage-collection rules, Gameplay Framework, Enhanced Input, components, replication, and Blueprint interoperability. Distinguish verified API from version-dependent assumptions. Do not claim to compile or run Unreal.",
        godot: "Act as a senior Godot engineer. Prefer Godot 4 GDScript, typed variables, nodes/scenes/signals/resources, input actions, physics lifecycle correctness, and reusable scene composition. Do not claim to run the Godot editor or export builds.",
        blender: "Act as a senior Blender technical artist and Python developer. Generate careful bpy scripts, respect Blender context/mode requirements, organize collections and materials, and explain safe export settings. Never claim to execute Blender or export an asset.",
        threejs: "Act as a senior Three.js/WebGL engineer. Use modern Three.js patterns, dispose GPU resources, manage render loops and resize handling, optimize draw calls, and consider mobile GPU limits. Do not claim to run a browser build.",
      };
      const task = req.task ?? "chat";
      const { result } = createResponsesCall(
        request,
        { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: MODEL },
        messages,
        "You are DEBS AI, an assistant for creating video games and software. When images or PDF files are attached, inspect their contents and answer based on them. Answer in the user's language. Be accurate, useful, and concise. " + modeInstructions[task] + " Never claim to have executed code, edited files, browsed the web, or connected tools unless the runtime actually confirms it. Clearly distinguish examples from verified results.",
        task === "search",
      );
      let streamError: unknown;
      for await (const part of result.fullStream) {
        if (part.type === "error") streamError = part.error;
      }
      if (streamError) throw streamError;
      const text = await result.text;
      if (!text.trim()) throw new GatewayError("Lovable AI n'a renvoyé aucun texte (réponse vide ou refus). Aucun nouvel essai automatique n'a été effectué.");
      const response = await result.response;
      return { text, model: response.modelId };
    } catch (error) {
      throw safeGatewayError(error);
    }
  },
};

const adapters: CodeModelProvider[] = [lovableProvider];
export function resolveProvider(): CodeModelProvider | null {
  return adapters.find((adapter) => adapter.isConfigured()) ?? null;
}
