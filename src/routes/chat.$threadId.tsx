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

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation — DEBS AI" },
      { name: "description", content: "Conversation de programmation DEBS AI." },
      { property: "og:title", content: "Conversation — DEBS AI" },
      { property: "og:description", content: "Conversation de programmation." },
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

  if (!ready) return <Loader2 className="mx-auto mt-10 animate-spin text-primary" />;
  if (!thread) return <EmptyState icon={<AlertTriangle />} title="Conversation introuvable" text="Elle a peut-être été supprimée." action={<Link to="/chat" className="text-primary">Retour</Link>} />;

  const push = (m: ChatMessage, title?: string) =>
    setThreads((p) => p.map((t) => (t.id === threadId ? { ...t, title: title ?? t.title, updatedAt: Date.now(), messages: [...t.messages, m] } : t)));

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), kind: "user", content: text, createdAt: Date.now() };
    push(userMsg, thread.messages.length === 0 ? titleFrom(text) : undefined);
    setLoading(true);
    try {
      const history = [...thread.messages, userMsg]
        .filter((m) => m.kind === "user" || m.kind === "assistant")
        .map((m) => ({ role: m.kind as "user" | "assistant", content: m.content }));
      const res = await send({ data: { messages: history } });
      push(res.ok
        ? { id: uid(), kind: "assistant", content: res.text, provider: res.provider, createdAt: Date.now() }
        : { id: uid(), kind: "notice", content: res.message, createdAt: Date.now() });
    } catch {
      push({ id: uid(), kind: "notice", content: "Erreur réseau : impossible de joindre le serveur.", createdAt: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link to="/chat" aria-label="Retour" className="rounded p-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-5" /></Link>
        <h1 className="truncate text-lg font-semibold">{thread.title}</h1>
      </div>
      <div className="space-y-4">
        {thread.messages.length === 0 && <p className="text-sm text-muted-foreground">Posez une question de programmation.</p>}
        {thread.messages.map((m) =>
          m.kind === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">{m.content}</div>
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
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Envoi…</div>}
      </div>
      <form className="glass sticky bottom-20 flex gap-2 rounded-xl border p-2 md:bottom-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Textarea autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Votre question…" rows={2} className="min-h-0 resize-none border-0 bg-transparent" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Envoyer"><Send /></Button>
      </form>
    </div>
  );
}
