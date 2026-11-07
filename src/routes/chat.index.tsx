import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageSquareCode, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, EmptyState, PageHeader, Panel } from "@/components/debs/ui";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, type Thread } from "@/lib/chat/threads";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Conversations — DEBS AI" },
      { name: "description", content: "Vos conversations de programmation avec DEBS AI." },
      { property: "og:title", content: "Conversations — DEBS AI" },
      { property: "og:description", content: "Historique des conversations de code." },
    ],
  }),
  component: ChatList,
});

function ChatList() {
  const [threads, setThreads] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const navigate = useNavigate();
  const create = () => {
    const id = uid("t_");
    setThreads((p) => [{ id, title: "Nouvelle conversation", updatedAt: Date.now(), messages: [] }, ...p]);
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };
  return (
    <div>
      <PageHeader title="Chat" subtitle="Historique enregistré dans ce navigateur." action={<Button onClick={create}><Plus /> Nouveau</Button>} />
      {threads.length === 0 ? (
        <EmptyState icon={<MessageSquareCode />} title="Aucune conversation" text="Démarrez une conversation de code." />
      ) : (
        <div className="space-y-2">
          {threads.map((th) => (
            <Link key={th.id} to="/chat/$threadId" params={{ threadId: th.id }}>
              <Panel className="mb-2 flex items-center justify-between gap-2 hover:border-primary/60">
                <span className="truncate">{th.title}</span>
                {th.demo && <DemoBadge label="Exemple" />}
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
