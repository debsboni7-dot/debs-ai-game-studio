import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Clock3, Coins, CreditCard, GitBranch, LogIn, LogOut, Menu, MessageSquarePlus, PanelLeftClose,
  PanelLeftOpen, Search, Settings2, Sparkles, X,
} from "lucide-react";
import { Logo } from "./ui";
import { uid } from "@/lib/storage";
import { useAccountThreads } from "@/lib/chat/account-threads";
import { supabase } from "@/integrations/supabase/client";
import { IntegrationProvider } from "@/lib/integrations/context";

export function AppShell({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useAccountThreads();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const now = Date.now();

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return query ? threads.filter((thread) => thread.title.toLocaleLowerCase("fr").includes(query)) : threads;
  }, [threads, search]);
  const groupedThreads = [
    { label: "Aujourd’hui", items: filteredThreads.filter((item) => now - item.updatedAt < 86_400_000) },
    { label: "Hier", items: filteredThreads.filter((item) => now - item.updatedAt >= 86_400_000 && now - item.updatedAt < 172_800_000) },
    { label: "7 derniers jours", items: filteredThreads.filter((item) => now - item.updatedAt >= 172_800_000 && now - item.updatedAt < 7 * 86_400_000) },
    { label: "Plus anciens", items: filteredThreads.filter((item) => now - item.updatedAt >= 7 * 86_400_000) },
  ].filter((group) => group.items.length > 0);

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
          const cloudThreads = cloudRows.map((row) => ({
            id: row.id, title: row.title, updatedAt: new Date(row.updated_at).getTime(),
            messages: (row.chat_messages ?? []).map((message) => ({
              id: message.id, kind: message.role, content: message.content,
              createdAt: new Date(message.created_at).getTime(),
            })),
          }));
          const cloudIds = new Set(cloudThreads.map((thread) => thread.id));
          setThreads((current) => [...cloudThreads, ...current.filter((thread) => !cloudIds.has(thread.id))]);
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
          const cloudThreads = data.map((row) => ({
            id: row.id, title: row.title, updatedAt: new Date(row.updated_at).getTime(),
            messages: (row.chat_messages ?? []).map((message) => ({
              id: message.id, kind: message.role, content: message.content,
              createdAt: new Date(message.created_at).getTime(),
            })),
          }));
          const cloudIds = new Set(cloudThreads.map((thread) => thread.id));
          setThreads((current) => [...cloudThreads, ...current.filter((thread) => !cloudIds.has(thread.id))]);
        });
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (pathname === "/connexion" || pathname === "/verifier-email" || pathname.startsWith("/api/")) return;
    let active = true;
    const enforceAuthentication = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        await navigate({ to: "/connexion", replace: true });
        return;
      }
      if (!data.session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        await navigate({ to: "/connexion", replace: true });
      }
    };
    void enforceAuthentication();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && !session && pathname !== "/connexion" && pathname !== "/verifier-email") {
        void navigate({ to: "/connexion", replace: true });
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [pathname, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    await navigate({ to: "/chat" });
    setMobileOpen(false);
  };

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
    setSearch("");
    setMobileOpen(false);
    await navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  const sidebar = (isMobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-[68px] shrink-0 items-center justify-between px-4">
        <Link to="/chat" onClick={() => setMobileOpen(false)} className="flex min-w-0 items-center gap-3">
          <Logo className="size-9 shrink-0" />
          {!collapsed || isMobile ? <span className="font-display text-lg font-bold tracking-tight">DEBS <span className="text-gradient-brand">AI</span></span> : null}
        </Link>
        {isMobile ? (
          <button onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        ) : (
          <button onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Développer la barre latérale" : "Réduire la barre latérale"} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700">
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>

      <div className={`px-3 ${collapsed && !isMobile ? "px-2" : ""}`}>
        <button onClick={createConversation} title="Nouvelle conversation" className={`flex w-full items-center gap-3 rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-[0_2px_12px_-8px_rgba(220,38,38,.5)] transition hover:border-red-400 hover:bg-red-50/60 ${collapsed && !isMobile ? "justify-center px-2" : ""}`}>
          <MessageSquarePlus className="size-[18px] shrink-0 text-red-600" />
          {(!collapsed || isMobile) && "Nouveau chat"}
        </button>
      </div>

      {(!collapsed || isMobile) && (
        <div className="px-3 pt-3">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-slate-400 focus-within:border-red-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-red-100">
            <Search className="size-4 shrink-0" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un chat" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            {search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche"><X className="size-3.5" /></button>}
          </label>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-5">
        {(!collapsed || isMobile) ? (
          <>
            <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Historique</div>
            {groupedThreads.length ? groupedThreads.map((group) => (
              <section key={group.label} className="mb-4">
                <h3 className="mb-1 px-2 text-[11px] font-medium text-slate-400">{group.label}</h3>
                {group.items.map((thread) => {
                  const active = pathname.endsWith("/" + thread.id);
                  return (
                    <Link key={thread.id} to="/chat/$threadId" params={{ threadId: thread.id }} onClick={() => setMobileOpen(false)}
                      className={`mb-0.5 block truncate rounded-lg px-3 py-2.5 text-[13px] transition ${active ? "bg-red-50 font-semibold text-red-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                      {thread.title || "Nouvelle conversation"}
                    </Link>
                  );
                })}
              </section>
            )) : <p className="px-2 text-xs leading-5 text-slate-400">{search ? "Aucun résultat." : "Tes conversations apparaîtront ici."}</p>}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-2">
            {filteredThreads.slice(0, 8).map((thread) => (
              <Link key={thread.id} to="/chat/$threadId" params={{ threadId: thread.id }} title={thread.title} className={`flex size-10 items-center justify-center rounded-xl text-xs font-semibold ${pathname.endsWith("/" + thread.id) ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500 hover:bg-red-50"}`}>
                {(thread.title || "N").slice(0, 1).toUpperCase()}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className={`mb-1 flex flex-col gap-1 ${collapsed && !isMobile ? "items-center" : ""}`}>
          <Link to="/integrations" onClick={() => setMobileOpen(false)} title="Outils et intégrations" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <GitBranch className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Outils et intégrations"}
          </Link>
          <Link to="/abonnement" onClick={() => setMobileOpen(false)} title="Abonnements" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <Sparkles className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Abonnements"}
          </Link>
          <Link to="/credits" onClick={() => setMobileOpen(false)} title="Crédits" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <Coins className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Crédits"}
          </Link>
          <Link to="/facturation" onClick={() => setMobileOpen(false)} title="Facturation" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <CreditCard className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Facturation"}
          </Link>
          <Link to="/missions" onClick={() => setMobileOpen(false)} title="Missions autonomes" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <Clock3 className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Missions autonomes"}
          </Link>
          <Link to="/parametres" onClick={() => setMobileOpen(false)} title="Paramètres" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-red-700">
            <Settings2 className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Paramètres"}
          </Link>
        </div>
        {userEmail ? (
          <div className={`mt-2 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 ${collapsed && !isMobile ? "justify-center" : ""}`}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">{userEmail.slice(0, 1).toUpperCase()}</div>
            {(!collapsed || isMobile) && <><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{userEmail}</span><button onClick={signOut} aria-label="Déconnexion" title="Déconnexion" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"><LogOut className="size-4" /></button></>}
          </div>
        ) : (
          <Link to="/connexion" onClick={() => setMobileOpen(false)} title="Connexion / Inscription" className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 ${collapsed && !isMobile ? "justify-center" : ""}`}>
            <LogIn className="size-[17px] shrink-0" /> {(!collapsed || isMobile) && "Connexion / Inscription"}
          </Link>
        )}
        {(!collapsed || isMobile) && <div className="mt-3 flex items-center gap-2 px-2 text-[10px] text-slate-400"><Sparkles className="size-3 text-red-500" /> DEBS 1.1 · Modèle IA</div>}
      </div>
    </div>
  );

  return (
    <IntegrationProvider>
      <div className="flex min-h-dvh bg-white text-slate-900">
        <aside className={`sticky top-0 hidden h-dvh shrink-0 border-r border-slate-200/80 bg-white transition-[width] duration-200 md:block ${collapsed ? "w-[76px]" : "w-[270px]"}`}>
          {sidebar(false)}
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <button aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]" />
            <aside className="absolute inset-y-0 left-0 w-[min(86vw,310px)] border-r border-slate-200 bg-white shadow-2xl">{sidebar(true)}</aside>
          </div>
        )}

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white/95 px-3 backdrop-blur md:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <button onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"><Menu className="size-5" /></button>
              <button onClick={() => setCollapsed((value) => !value)} aria-label="Afficher ou masquer la barre latérale" className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:inline-flex"><PanelLeftOpen className="size-4" /></button>
              <Link to="/chat" className="truncate text-sm font-semibold tracking-tight text-slate-800">DEBS AI</Link>
              <span className="hidden rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 sm:inline-flex">DEBS 1.1</span>
            </div>
            <button onClick={createConversation} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700">
              <MessageSquarePlus className="size-4" /><span className="hidden sm:inline">Nouveau chat</span>
            </button>
          </header>
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 md:px-10 md:pt-6">
            {children}
          </main>
        </div>
      </div>
    </IntegrationProvider>
  );
}
