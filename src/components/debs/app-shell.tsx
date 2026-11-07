import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus, Settings2, Sparkles } from "lucide-react";
import { Logo } from "./ui";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, type Thread } from "@/lib/chat/threads";

export function AppShell({ children }: { children: ReactNode }) {
  const [threads, setThreads] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const navigate = useNavigate();
  const createConversation = () => {
    const id = uid("t_");
    setThreads((items) => [{ id, title: "Nouvelle conversation", updatedAt: Date.now(), messages: [] }, ...items]);
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <aside className="hidden h-dvh w-[270px] shrink-0 flex-col border-r border-white/70 bg-white/75 p-4 shadow-[8px_0_35px_-30px_rgba(52,128,255,.55)] backdrop-blur-2xl md:sticky md:top-0 md:flex">
        <Link to="/chat" className="mb-7 flex items-center gap-3 px-2">
          <Logo className="size-9" />
          <span className="font-display text-lg font-bold tracking-tight">DEBS <span className="text-gradient-brand">AI</span></span>
        </Link>
        <button onClick={createConversation} className="glow-outline flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5">
          <MessageSquarePlus className="size-4" /> Nouvelle conversation
        </button>
        <div className="mb-2 mt-8 px-2 text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">Récents</div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {threads.slice(0, 30).map((thread) => (
            <Link key={thread.id} to="/chat/$threadId" params={{ threadId: thread.id }} className="block truncate rounded-xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
              {thread.title || "Nouvelle conversation"}
            </Link>
          ))}
        </div>
        <Link to="/parametres" className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200/80 px-3 py-3 text-sm text-slate-600 transition hover:border-blue-300 hover:text-blue-700">
          <Settings2 className="size-4" /> Paramètres
        </Link>
        <div className="mt-4 flex items-center gap-2 px-2 text-xs text-slate-400"><Sparkles className="size-3.5 text-blue-500" /> Votre espace intelligent</div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/80 bg-white/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <Link to="/chat" className="flex items-center gap-2">
            <Logo className="size-8" />
            <span className="font-display font-bold">DEBS <span className="text-gradient-brand">AI</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={createConversation} aria-label="Nouvelle conversation" className="glow-icon rounded-xl p-2"><MessageSquarePlus className="size-5" /></button>
            <Link to="/parametres" aria-label="Paramètres" className="rounded-xl border border-slate-200 p-2 text-slate-600"><Settings2 className="size-5" /></Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-5 pt-4 sm:px-6 md:px-10 md:pt-8">{children}</main>
      </div>
    </div>
  );
}
