import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Clock3, GitBranch, LogIn, LogOut, MessageSquarePlus, Settings2, Sparkles } from "lucide-react";
import { Logo } from "./ui";
import { STORAGE_KEYS, uid, usePersistentState } from "@/lib/storage";
import { seedThreads, type Thread } from "@/lib/chat/threads";
import { supabase } from "@/integrations/supabase/client";
import { IntegrationProvider } from "@/lib/integrations/context";

export function AppShell({ children }: { children: ReactNode }) {
  const [threads, setThreads] = usePersistentState<Thread[]>(STORAGE_KEYS.threads, seedThreads);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const now = Date.now();
  const groupedThreads = [
    { label: "Aujourd’hui", items: threads.filter((item) => now - item.updatedAt < 86_400_000) },
    { label: "Hier", items: threads.filter((item) => now - item.updatedAt >= 86_400_000 && now - item.updatedAt < 172_800_000) },
    { label: "7 derniers jours", items: threads.filter((item) => now - item.updatedAt >= 172_800_000 && now - item.updatedAt < 7 * 86_400_000) },
    { label: "Plus anciens", items: threads.filter((item) => now - item.updatedAt >= 7 * 86_400_000) },
  ].filter((group) => group.items.length > 0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      setUserEmail(user?.email ?? null);
      if (user) {
        const { data: cloudRows, error } = await supabase
          .from("conversations")
          .select("id,title,updated_at,chat_messages(id,role,content,created_at)")
          .order("updated_at", { ascending: false });
        if (active && !error && cloudRows?.length) {
          const cloudThreads: Thread[] = cloudRows.map((row) => ({
            id: row.id,
            title: row.title,
            updatedAt: new Date(row.updated_at).getTime(),
            messages: (row.chat_messages ?? []).map((message) => ({
              id: message.id,
              kind: message.role,
              content: message.content,
              createdAt: new Date(message.created_at).getTime(),
            })),
          }));
          setThreads(cloudThreads);
        }
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (!session) return;
      void supabase.from("conversations")
        .select("id,title,updated_at,chat_messages(id,role,content,created_at)")
        .order("updated_at", { ascending: false })
        .then(({ data, error }) => {
          if (!active || error || !data?.length) return;
          setThreads(data.map((row) => ({
            id: row.id, title: row.title, updatedAt: new Date(row.updated_at).getTime(),
            messages: (row.chat_messages ?? []).map((message) => ({
              id: message.id, kind: message.role, content: message.content,
              createdAt: new Date(message.created_at).getTime(),
            })),
          })));
        });
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  const signOut = async () => { await supabase.auth.signOut(); setUserEmail(null); await navigate({ to: "/chat" }); };
  const createConversation = async () => {
    let id = uid("t_");
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data, error } = await supabase.from("conversations")
        .insert({ user_id: auth.user.id, title: "Nouvelle conversation" })
        .select("id").single();
      if (!error && data) id = data.id;
    }
    setThreads((items) => [{ id, title: "Nouvelle conversation", updatedAt: Date.now(), messages: [] }, ...items]);
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  return (
    <IntegrationProvider>
      <div className="min-h-dvh bg-background text-foreground md:flex">
        <aside className="hidden h-dvh w-[270px] shrink-0 flex-col border-r border-white/70 bg-white/75 p-4 shadow-[8px_0_35px_-30px_rgba(52,128,255,.55)] backdrop-blur-2xl md:sticky md:top-0 md:flex">
          <Link to="/chat" className="mb-7 flex items-center gap-3 px-2">
            <Logo className="size-9" />
            <span className="font-display text-lg font-bold tracking-tight">DEBS <span className="text-gradient-brand">AI</span></span>
          </Link>
          <button onClick={createConversation} className="glow-outline flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5">
            <MessageSquarePlus className="size-4" /> Nouvelle conversation
          </button>
          <Link to="/integrations" className="mt-3 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50">
            <GitBranch className="size-4" /> Développement & intégrations
          </Link>
          <div className="mb-2 mt-8 px-2 text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">Historique des conversations</div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {groupedThreads.map((group) => (
              <section key={group.label} className="space-y-1">
                <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</h3>
                {group.items.map((thread) => {
                  const active = pathname.endsWith("/" + thread.id);
                  return <Link key={thread.id} to="/chat/$threadId" params={{ threadId: thread.id }} className={`block truncate rounded-xl border px-3 py-2.5 text-sm transition ${active ? "border-blue-200 bg-blue-50 font-semibold text-blue-800 shadow-[inset_3px_0_0_#397dff]" : "border-transparent text-slate-600 hover:border-blue-100 hover:bg-blue-50/70 hover:text-blue-700"}`}>
                    {thread.title || "Nouvelle conversation"}
                  </Link>;
                })}
              </section>
            ))}
            {threads.length === 0 && <p className="px-2 text-xs text-slate-400">Tes conversations apparaîtront ici.</p>}
          </div>
          {userEmail ? (
            <div className="mt-3 space-y-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="truncate text-xs text-slate-500">{userEmail}</p>
              <button onClick={signOut} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"><LogOut className="size-4" /> Déconnexion</button>
            </div>
          ) : (
            <Link to="/connexion" className="mt-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"><LogIn className="size-4" /> Connexion / Inscription</Link>
          )}
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
              <Link to="/integrations" aria-label="Développement et intégrations" className="rounded-xl border border-blue-200 p-2 text-blue-600"><GitBranch className="size-5" /></Link>\n              <Link to="/missions" aria-label="Missions longue durée" className="rounded-xl border border-violet-200 p-2 text-violet-600"><Clock3 className="size-5" /></Link>
              <button onClick={createConversation} aria-label="Nouvelle conversation" className="glow-icon rounded-xl p-2"><MessageSquarePlus className="size-5" /></button>
              {userEmail ? <button onClick={signOut} aria-label="Déconnexion" className="rounded-xl border border-blue-200 p-2 text-blue-600"><LogOut className="size-5" /></button> : <Link to="/connexion" aria-label="Connexion" className="rounded-xl border border-blue-200 p-2 text-blue-600"><LogIn className="size-5" /></Link>}
              <Link to="/parametres" aria-label="Paramètres" className="rounded-xl border border-slate-200 p-2 text-slate-600"><Settings2 className="size-5" /></Link>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-5 pt-4 sm:px-6 md:px-10 md:pt-8">{children}</main>
        </div>
      </div>
    </IntegrationProvider>
  );
}
