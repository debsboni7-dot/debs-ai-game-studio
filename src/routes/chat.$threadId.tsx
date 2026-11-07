import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DemoBadge, EmptyState } from "@/components/debs/ui";
import { Markdown } from "@/components/debs/markdown";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, titleFrom, type ChatMessage, type Thread } from "@/lib/chat/threads";
import { sendChatMessage } from "@/lib/ai/chat.functions";
import { supabase } from "@/integrations/supabase/client";

const COMMANDS = [
  { command: "/code", label: "Programmation", description: "Code, architecture et implémentation" },
  { command: "/search", label: "Recherche", description: "Recherche web (si l'outil est disponible)" },
  { command: "/game-design", label: "Game design", description: "Mécaniques, progression et équilibrage" },
  { command: "/debug", label: "Debug", description: "Diagnostiquer et corriger un problème" },
  { command: "/review", label: "Code review", description: "Analyser la qualité et les risques du code" },
  { command: "/help", label: "Commandes", description: "Afficher les commandes disponibles" },
] as const;

type Task = "chat" | "code" | "search" | "game-design" | "debug" | "review";

function parseCommand(raw: string): { task: Task; prompt: string; help: boolean } {
  const match = raw.match(/^\/(code|search|game-design|debug|review|help)(?:\s+([\s\S]*))?$/i);
  if (!match) return { task: "chat", prompt: raw, help: false };
  const command = match[1].toLowerCase();
  return {
    task: command === "help" ? "chat" : command as Task,
    prompt: (match[2] ?? "").trim(),
    help: command === "help",
  };
}

const HELP_TEXT = [
  "### Commandes DEBS AI",
  "",
  "- `/code` — programmation et architecture",
  "- `/search` — demande de recherche web",
  "- `/game-design` — conception des mécaniques et systèmes de jeu",
  "- `/debug` — diagnostic et correction de bugs",
  "- `/review` — revue de code",
  "- `/help` — afficher cette aide",
  "",
  "Sans commande slash, DEBS AI répond en mode général. Écris la commande, ajoute un espace, puis ton message. Exemple : `/debug Mon personnage traverse le sol...`",
  "",
  "Note : le mode recherche ne prétendra jamais avoir consulté le Web si aucun outil de recherche réel n'est disponible.",
].join("\n");

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation — DEBS AI" },
      { name: "description", content: "Conversation avec DEBS AI, assistant général et spécialisé en création de jeux." },
      { property: "og:title", content: "Conversation — DEBS AI" },
      { property: "og:description", content: "Conversation avec DEBS AI." },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const [threads, setThreads, ready] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const send = useServerFn(sendChatMessage);
  const thread = threads.find((t) => t.id === threadId);
  const commandQuery = input.startsWith("/") && !/\s/.test(input) ? input.toLowerCase() : null;
  const suggestions = commandQuery === null
    ? []
    : COMMANDS.filter((item) => item.command.startsWith(commandQuery));

  if (!ready) return <Loader2 className="mx-auto mt-10 animate-spin text-primary" />;
  if (!thread) return <EmptyState icon={<AlertTriangle />} title="Conversation introuvable" text="Elle a peut-être été supprimée." action={<Link to="/chat" className="text-primary">Retour</Link>} />;

  const push = (m: ChatMessage, title?: string) =>
    setThreads((p) => p.map((t) => (t.id === threadId ? { ...t, title: title ?? t.title, updatedAt: Date.now(), messages: [...t.messages, m] } : t)));

  const submit = async () => {
    const raw = input.trim();
    if (!raw || loading) return;
    const parsed = parseCommand(raw);
    if (!parsed.help && !parsed.prompt) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), kind: "user", content: raw, createdAt: Date.now() };
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
          await supabase.from("conversations").update({
            title: nextTitle, updated_at: new Date().toISOString(),
          }).eq("id", threadId);
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
    try {
      const history = [...thread.messages, userMsg]
        .filter((m) => m.kind === "user" || m.kind === "assistant")
        .map((m) => ({ role: m.kind as "user" | "assistant", content: m.content }));
      history[history.length - 1] = { role: "user", content: parsed.prompt };
      const res = await send({ data: { messages: history, task: parsed.task } });
      if (res.ok) {
        push({ id: uid(), kind: "assistant", content: res.text, provider: res.provider, createdAt: Date.now() });
        if (cloudUserId) {
          const { error } = await supabase.from("chat_messages").insert({
            conversation_id: threadId, user_id: cloudUserId, role: "assistant", content: res.text,
          });
          if (error) push({ id: uid(), kind: "notice", content: "La réponse est affichée, mais sa sauvegarde cloud a échoué.", createdAt: Date.now() });
          else await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        }
      } else {
        push({ id: uid(), kind: "notice", content: res.message, createdAt: Date.now() });
      }
    } catch {
      push({ id: uid(), kind: "notice", content: "Erreur réseau : impossible de joindre le serveur.", createdAt: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link to="/chat" aria-label="Retour" className="rounded p-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-5" /></Link>
        <h1 className="truncate text-lg font-semibold">{thread.title}</h1>
      </div>
      <div className="flex-1 space-y-4">
        {thread.messages.length === 0 && (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-12 text-center">
            <div className="text-2xl font-semibold tracking-tight">Que veux-tu créer aujourd'hui ?</div>
            <p className="text-sm text-muted-foreground">Pose une question librement ou commence par une commande slash.</p>
            <p className="text-xs text-muted-foreground">Exemple : <code className="rounded bg-muted px-2 py-1 text-primary">/game-design</code> Définis le système de combat de mon jeu.</p>
          </div>
        )}
        {thread.messages.map((m) =>
          m.kind === "user" ? (
            <div key={m.id} className="ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">{m.content}</div>
          ) : m.kind === "notice" ? (
            <div key={m.id} role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="size-4 shrink-0" /> {m.content}
            </div>
          ) : (
            <div key={m.id} className="space-y-2">
              {m.kind === "example" ? <DemoBadge label="Exemple statique — pas généré par une IA" /> : <span className="text-xs text-muted-foreground">{m.provider}</span>}
              <Markdown>{m.content}</Markdown>
            </div>
          ),
        )}
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> DEBS AI réfléchit…</div>}
      </div>
      <form className="glass sticky bottom-20 z-20 flex flex-col gap-2 rounded-2xl border p-2 shadow-lg md:bottom-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
          <Textarea autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message à DEBS AI… ( / pour les commandes )" rows={2} className="min-h-0 resize-none border-0 bg-transparent focus-visible:ring-0" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <Button type="submit" size="icon" className="shrink-0 rounded-xl" disabled={loading || !input.trim()} aria-label="Envoyer"><Send /></Button>
        </div>
        <div className="px-2 pb-1 text-[11px] text-muted-foreground">Mode général par défaut · Tape / pour choisir un domaine · Entrée pour envoyer</div>
      </form>
    </div>
  );
}
