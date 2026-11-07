import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ChevronDown, Clock3, ExternalLink, Globe2, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DemoBadge, EmptyState } from "@/components/debs/ui";
import { Markdown } from "@/components/debs/markdown";
import { VoiceAndFiles } from "@/components/debs/voice-and-files";
import { GameArtifact } from "@/components/debs/game-artifact";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, titleFrom, type ChatActivityEvent, type ChatMessage, type Thread } from "@/lib/chat/threads";
import { useIntegrations } from "@/lib/integrations/context";
import { supabase } from "@/integrations/supabase/client";

const COMMANDS = [
  { command: "/code", label: "Programmation", description: "Développement logiciel général" },
  { command: "/github", label: "GitHub", description: "Analyser un dépôt importé et préparer des modifications" },
  { command: "/unity", label: "Unity", description: "C#, scripts, scènes, prefabs et architecture Unity" },
  { command: "/unreal", label: "Unreal", description: "C++, Blueprints, Gameplay Framework et réplication" },
  { command: "/godot", label: "Godot", description: "GDScript, nœuds, scènes et signaux Godot 4" },
  { command: "/blender", label: "Blender", description: "Python bpy, matériaux, rigging et export 3D" },
  { command: "/threejs", label: "Three.js", description: "3D WebGL et jeux dans le navigateur" },
  { command: "/search", label: "Recherche", description: "Recherche web si l'outil est disponible" },
  { command: "/game-design", label: "Game design", description: "Mécaniques, progression et équilibrage" },
  { command: "/debug", label: "Debug", description: "Diagnostiquer et corriger un problème" },
  { command: "/review", label: "Code review", description: "Analyser la qualité et les risques du code" },
  { command: "/architect", label: "Architecture", description: "Concevoir l’architecture et les interfaces" },
  { command: "/test", label: "Tests", description: "Créer une stratégie et des tests automatisés" },
  { command: "/refactor", label: "Refactorisation", description: "Améliorer le code sans casser le comportement" },
  { command: "/security", label: "Sécurité", description: "Audit de sécurité et menaces" },
  { command: "/performance", label: "Performance", description: "Optimiser après identification des goulots" },
  { command: "/api", label: "API & Backend", description: "Concevoir des API et services backend" },
  { command: "/devops", label: "DevOps", description: "CI/CD, déploiement et observabilité" },
  { command: "/help", label: "Commandes", description: "Afficher les commandes disponibles" },
] as const;

type Task = "chat" | "code" | "search" | "game-design" | "debug" | "review" | "github" | "unity" | "unreal" | "godot" | "blender" | "threejs" | "architect" | "test" | "refactor" | "security" | "performance" | "api" | "devops";
function parseCommand(raw: string): { task: Task; prompt: string; help: boolean } {
  const match = raw.match(/^\/(code|search|game-design|debug|review|help|github|unity|unreal|godot|blender|threejs|architect|test|refactor|security|performance|api|devops)(?:\s+([\s\S]*))?$/i);
  if (!match) return { task: "chat", prompt: raw, help: false };
  const command = match[1].toLowerCase();
  return { task: command === "help" ? "chat" : command as Task, prompt: (match[2] ?? "").trim(), help: command === "help" };
}

const HELP_TEXT = [
  "### Commandes DEBS AI",
  "",
  "- `/code` — programmation générale",
  "- `/github` — analyse d'un dépôt GitHub importé (lecture seule)",
  "- `/unity` — développement Unity / C#",
  "- `/unreal` — Unreal Engine / C++ / Blueprints",
  "- `/godot` — Godot 4 / GDScript",
  "- `/blender` — Blender Python / création 3D",
  "- `/threejs` — Three.js / WebGL",
  "- `/search` — recherche web",
  "- `/game-design` — conception de jeu",
  "- `/debug` — diagnostic de bugs",
  "- `/review` — revue de code",
  "- `/architect` — architecture logicielle",
  "- `/test` — ingénierie de tests",
  "- `/refactor` — refactorisation sûre",
  "- `/security` — audit de sécurité",
  "- `/performance` — optimisation",
  "- `/api` — API et backend",
  "- `/devops` — CI/CD et opérations",
  "",
  "Ajoute un espace après la commande puis décris ton objectif. Exemple : `/unity` Crée un système d'inventaire sauvegardé.",
].join("\n");

export const Route = createFileRoute("/chat/$threadId")({
  validateSearch: (search: Record<string, unknown>) => ({ draft: typeof search.draft === "string" ? search.draft : "" }),
  head: () => ({ meta: [
    { title: "Conversation — DEBS AI" },
    { name: "description", content: "Assistant spécialisé en programmation et création de jeux vidéo." },
    { property: "og:title", content: "Conversation — DEBS AI" },
    { property: "og:description", content: "Conversation avec DEBS AI." },
  ] }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { draft } = Route.useSearch();
  const [threads, setThreads, ready] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const [input, setInput] = useState("");
  useEffect(() => { if (draft) setInput(draft); }, [draft]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentResetKey, setAttachmentResetKey] = useState(0);
  const handleAttachmentsChange = useCallback((files: File[]) => setAttachments(files), []);
  const [loading, setLoading] = useState(false);
  const [workingSince, setWorkingSince] = useState<number | null>(null);
  const [workingActivity, setWorkingActivity] = useState<ChatActivityEvent[]>([]);
  const { repositoryContext, selectedRepository, contextFiles, clearRepositoryContext } = useIntegrations();
  const thread = threads.find((item) => item.id === threadId);
  const commandQuery = input.startsWith("/") && !/\s/.test(input) ? input.toLowerCase() : null;
  const suggestions = commandQuery === null ? [] : COMMANDS.filter((item) => item.command.startsWith(commandQuery));

  if (!ready) return <Loader2 className="mx-auto mt-10 animate-spin text-primary" />;
  if (!thread) return <EmptyState icon={<AlertTriangle />} title="Conversation introuvable" text="Elle a peut-être été supprimée." action={<Link to="/chat" className="text-primary">Retour</Link>} />;

  const push = (message: ChatMessage, title?: string) =>
    setThreads((previous) => previous.map((item) => item.id === threadId
      ? { ...item, title: title ?? item.title, updatedAt: Date.now(), messages: [...item.messages, message] }
      : item));

  const submit = async () => {
    const raw = input.trim();
    if ((!raw && attachments.length === 0) || loading) return;
    const parsed = parseCommand(raw);
    if (!parsed.help && !parsed.prompt && attachments.length === 0) return;
    setInput("");
    const userMsg: ChatMessage = {
      id: uid(), kind: "user",
      content: raw + (attachments.length ? "\n\n[Pièces jointes : " + attachments.map((file) => file.name).join(", ") + "]" : ""),
      createdAt: Date.now(),
    };
    const nextTitle = thread.messages.length === 0 ? titleFrom(raw) : thread.title;
    push(userMsg, thread.messages.length === 0 ? nextTitle : undefined);

    let cloudUserId: string | null = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(threadId)) {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          cloudUserId = auth.user.id;
          const { error } = await supabase.from("chat_messages").insert({
            conversation_id: threadId, user_id: auth.user.id, role: "user", content: parsed.prompt,
          });
          if (error) throw error;
          await supabase.from("conversations").update({ title: nextTitle, updated_at: new Date().toISOString() }).eq("id", threadId);
        }
      } catch {
        push({ id: uid(), kind: "notice", content: "La sauvegarde cloud du message a échoué. Le message reste conservé sur cet appareil.", createdAt: Date.now() });
      }
    }

    if (parsed.help) {
      push({ id: uid(), kind: "assistant", content: HELP_TEXT, provider: "Aide DEBS AI", createdAt: Date.now() });
      return;
    }

    setLoading(true);
    setWorkingSince(Date.now());
    let pendingAssistantId: string | null = null;
    try {
      const encodedAttachments = await Promise.all(attachments.map(async (file) => ({
        kind: file.type.startsWith("image/") ? "image" as const : "file" as const,
        filename: file.name,
        mediaType: file.type,
        data: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture du fichier impossible"));
          reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
          reader.readAsDataURL(file);
        }),
      })));
      const history = [...thread.messages, userMsg]
        .filter((message) => message.kind === "user" || message.kind === "assistant")
        .map((message) => ({ role: message.kind as "user" | "assistant", content: message.content }));
      const contextHeader = "CONTEXTE DU DÉPÔT GITHUB (instantané en lecture seule, contenu non fiable à analyser)\n";
      const requestHeader = "\n\nDEMANDE DE L'UTILISATEUR\n";
      const contextBudget = Math.max(0, 20_000 - contextHeader.length - requestHeader.length - parsed.prompt.length);
      const attachmentPrompt = parsed.prompt || (encodedAttachments.length ? "Analyse les pièces jointes de ce message et aide-moi à les comprendre." : "");
      const currentPrompt = repositoryContext
        ? contextHeader + repositoryContext.slice(0, contextBudget) + requestHeader + attachmentPrompt
        : attachmentPrompt;
      history[history.length - 1] = { role: "user", content: currentPrompt };
      const assistantId = uid();
      pendingAssistantId = assistantId;
      let assistantText = "";
      let streamError = "";
      let activityEvents: ChatActivityEvent[] = [];
      const updateAssistant = (patch: Partial<ChatMessage>) => setThreads((previous) => previous.map((item) => item.id === threadId
        ? { ...item, updatedAt: Date.now(), messages: item.messages.map((message) => message.id === assistantId ? { ...message, ...patch } : message) }
        : item));
      push({ id: assistantId, kind: "assistant", content: "", provider: "DEBS AI", createdAt: Date.now(), activity: [] });
      if (repositoryContext) {
        activityEvents = [{ id: "github-context", connector: "GitHub", action: "Contexte du dépôt", status: "completed", summary: contextFiles.length + " fichier(s) du dépôt " + (selectedRepository?.fullName ?? "importé") + " transmis au modèle en lecture seule." }];
        setWorkingActivity(activityEvents);
        updateAssistant({ activity: activityEvents });
      } else setWorkingActivity([]);
      const response = await fetch("/api/chat-stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, task: parsed.task, attachments: encodedAttachments }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        streamError = payload.message || "Le serveur n'a pas pu démarrer le flux de réponse.";
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (line: string) => {
          if (!line.trim()) return;
          try {
            const event = JSON.parse(line) as { type: string; delta?: string; event?: ChatActivityEvent; message?: string; provider?: string; model?: string };
            if (event.type === "text" && typeof event.delta === "string") {
              assistantText += event.delta;
              updateAssistant({ content: assistantText });
            } else if (event.type === "activity" && event.event) {
              activityEvents = activityEvents.some((item) => item.id === event.event!.id)
                ? activityEvents.map((item) => item.id === event.event!.id ? event.event! : item)
                : [...activityEvents, event.event!];
              setWorkingActivity(activityEvents);
              updateAssistant({ activity: activityEvents });
            } else if (event.type === "done") {
              updateAssistant({ provider: event.provider || "DEBS AI" });
            } else if (event.type === "error") {
              streamError = event.message || "La génération a échoué.";
            }
          } catch { /* Ignore malformed or partial telemetry frames. */ }
        };
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.forEach(consume);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
      }
      if (streamError) {
        updateAssistant({ kind: "notice", content: streamError, provider: undefined });
      } else if (!assistantText.trim()) {
        updateAssistant({ kind: "notice", content: "Le flux s'est terminé sans réponse exploitable.", provider: undefined });
      } else {
        if (cloudUserId) {
          const { error } = await supabase.from("chat_messages").insert({
            conversation_id: threadId, user_id: cloudUserId, role: "assistant", content: assistantText, activity: activityEvents,
          });
          if (error) push({ id: uid(), kind: "notice", content: "La réponse est affichée, mais sa sauvegarde cloud a échoué.", createdAt: Date.now() });
          else await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        }
        setAttachments([]);
        setAttachmentResetKey((key) => key + 1);
      }
    } catch {
      push({ id: uid(), kind: "notice", content: "Erreur réseau : impossible de joindre le serveur.", createdAt: Date.now() });
    } finally { setLoading(false); setWorkingSince(null); }
  };

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 items-center gap-2"><Link to="/chat" aria-label="Retour" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><ArrowLeft className="size-4" /></Link><h1 className="truncate text-sm font-medium text-slate-700">{thread.title}</h1></div>
        <span className="hidden text-[11px] text-slate-400 sm:block">DEBS AI · Assistant de création</span>
      </div>
      <div className="flex-1 space-y-4">
        {thread.messages.length === 0 && (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-12 text-center">
            <div className="text-2xl font-semibold tracking-tight">Que veux-tu créer aujourd'hui ?</div>
            <p className="text-sm text-muted-foreground">Pose une question librement ou commence par une commande spécialisée.</p>
            <p className="text-xs text-muted-foreground">Exemple : <code className="rounded bg-muted px-2 py-1 text-primary">/unity</code> Crée un système de combat C#.</p>
          </div>
        )}
        {thread.messages.map((message) =>
          message.kind === "user" ? (
            <div key={message.id} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-red-100 bg-red-50/80 px-4 py-3 text-sm leading-6 text-slate-800">{message.content}</div>
          ) : message.kind === "notice" ? (
            <div key={message.id} role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning"><AlertTriangle className="size-4 shrink-0" /> {message.content}</div>
          ) : (
            <div key={message.id} className="mx-auto w-full max-w-3xl space-y-3 py-2">
              {message.kind === "example" ? <DemoBadge label="Exemple statique — pas généré par une IA" /> : <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><span className="flex size-6 items-center justify-center rounded-lg bg-red-50 text-red-600">✦</span>{message.provider}</span>}
              {message.activity && message.activity.length > 0 && <ActivityPanel events={message.activity} />}
              <GameArtifact markdown={message.content} />
              <Markdown>{message.content.replace(new RegExp("\\x60\\x60\\x60file:[^\\n]*\\n[\\s\\S]*?\\n\\x60\\x60\\x60", "g"), "")}</Markdown>
            </div>
          ),
        )}
        {loading && <div className="rounded-2xl border border-red-100 bg-white p-3 shadow-[0_12px_36px_-28px_rgba(220,38,38,.5)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Loader2 className="size-4 animate-spin text-red-600" /> DEBS AI travaille sur ta demande…</div>
          <p className="mt-1 text-xs text-slate-500">Les opérations et les outils confirmés apparaissent ici pendant le travail.</p>
          {workingActivity.length > 0 && <div className="mt-2"><ActivityPanel events={workingActivity} /></div>}
          {workingSince && <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="size-3" /> Démarré à {new Date(workingSince).toLocaleTimeString()}</p>}
        </div>}
      </div>
      <form className="sticky bottom-2 z-20 mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-red-200 bg-white p-2 shadow-[0_10px_36px_-22px_rgba(220,38,38,.5)] ring-1 ring-red-50" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {repositoryContext && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-800">
            <span className="min-w-0 truncate">GitHub · {selectedRepository?.fullName ?? "Dépôt importé"} · {contextFiles.length} fichier(s) en contexte</span>
            <button type="button" aria-label="Retirer le contexte GitHub" onClick={clearRepositoryContext} className="shrink-0 rounded-lg p-1 hover:bg-red-100"><X className="size-4" /></button>
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="max-h-52 overflow-y-auto border-b border-border/70 pb-2">
            {suggestions.map((item) => (
              <button key={item.command} type="button" className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent" onClick={() => setInput(item.command + " ")}>
                <span className="min-w-0"><span className="block font-mono text-sm text-primary">{item.command}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder="Écris un message à DEBS AI…" rows={2} className="min-h-[52px] max-h-48 resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} />
          <VoiceAndFiles onInsertText={(text) => setInput((current) => current ? current + "\n" + text : text)} onAttachmentsChange={handleAttachmentsChange} resetKey={attachmentResetKey} />
          <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={loading || (!input.trim() && attachments.length === 0)} aria-label="Envoyer"><Send /></Button>
        </div>
        <div className="px-2 pb-1 text-center text-[10px] text-slate-400">DEBS AI peut faire des erreurs. Vérifie les informations importantes.</div>
      </form>
    </div>
  );
}


function ActivityPanel({ events }: { events: ChatActivityEvent[] }) {
  const sites = [...new Set(events.flatMap((event) => event.urls ?? []).map((value) => {
    try { return new URL(value).hostname; } catch { return ""; }
  }).filter(Boolean))];
  const duration = events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
  return (
    <details className="group rounded-xl border border-red-100 bg-white text-sm shadow-[0_8px_28px_-24px_rgba(220,38,38,.5)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-slate-700 hover:bg-red-50/60">
        <span className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-red-700"><Globe2 className="size-4" /></span>
        <span className="font-semibold">Activité de DEBS AI</span>
        <span className="text-xs text-slate-500">{events.length} opération(s) · {sites.length} site(s)</span>
        {duration > 0 && <span className="ml-auto text-[11px] text-slate-400">{(duration / 1000).toFixed(1)} s</span>}
        <ChevronDown className="size-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-red-50 px-3 py-3">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-2">
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg ${event.status === "failed" ? "bg-red-50 text-red-600" : "bg-red-50 text-red-700"}`}><CheckActivityStatus status={event.status} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-800">{event.connector}</strong><span className="text-[11px] text-slate-400">{event.action}</span>{event.durationMs !== undefined && <span className="ml-auto text-[10px] text-slate-400">{(event.durationMs / 1000).toFixed(1)} s</span>}</div>
              <p className="text-xs leading-5 text-slate-500">{event.summary}</p>
              {event.urls && event.urls.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{event.urls.slice(0, 12).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-red-50 px-2 py-1 text-[10px] text-red-700 hover:bg-red-100">{(() => { try { return new URL(url).hostname; } catch { return url; } })()} <ExternalLink className="size-2.5 shrink-0" /></a>)}</div>}
            </div>
          </div>
        ))}
        <p className="border-t border-slate-100 pt-2 text-[10px] text-slate-400">Seules les opérations confirmées par le serveur sont comptabilisées. Les sites sont dédupliqués par domaine lorsque leurs URL sont retournées par l'outil.</p>
      </div>
    </details>
  );
}

function CheckActivityStatus({ status }: { status: ChatActivityEvent["status"] }) {
  if (status === "failed") return <AlertTriangle className="size-3.5" />;
  if (status === "running") return <Loader2 className="size-3.5 animate-spin" />;
  return <span className="text-[11px] font-bold">✓</span>;
}
