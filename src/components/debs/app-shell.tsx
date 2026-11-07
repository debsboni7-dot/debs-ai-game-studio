import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Code2, Gamepad2, Home, MessageSquareCode, Plug, Settings } from "lucide-react";
import { t } from "@/lib/i18n";
import { Logo } from "./ui";

const nav = [
  { to: "/", label: t("nav.home"), icon: Home, exact: true },
  { to: "/chat", label: t("nav.chat"), icon: MessageSquareCode, exact: false },
  { to: "/atelier", label: t("nav.workshop"), icon: Code2, exact: false },
  { to: "/studio", label: t("nav.studio"), icon: Gamepad2, exact: false },
  { to: "/parametres", label: t("nav.settings"), icon: Settings, exact: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-semibold">DEBS <span className="text-gradient-brand">AI</span></span>
        </Link>
        <nav className="flex flex-col gap-1">
          {[...nav.slice(0, 4), { to: "/integrations", label: t("nav.integrations"), icon: Plug, exact: false }, nav[4]].map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto text-xs text-muted-foreground">MVP · {t("common.demoMode")}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="size-7" />
            <span className="font-display font-semibold">DEBS <span className="text-gradient-brand">AI</span></span>
          </Link>
          <Link to="/integrations" className="rounded-lg p-2 text-muted-foreground hover:text-foreground data-[status=active]:text-primary" aria-label={t("nav.integrations")}>
            <Plug className="size-5" />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t md:hidden" aria-label="Navigation principale">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.exact }}
            className="flex flex-col items-center gap-1 pt-2.5 text-[0.68rem] text-muted-foreground data-[status=active]:text-primary"
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
