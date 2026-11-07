import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/debs/app-shell";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return <div className="flex min-h-screen items-center justify-center px-4"><div className="text-center"><h1 className="text-7xl font-bold">404</h1><p className="mt-3 text-slate-500">Cette page n'existe pas.</p><Link to="/chat" className="mt-5 inline-block text-blue-600">Retour à DEBS AI</Link></div></div>;
}
function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return <div className="flex min-h-screen items-center justify-center px-4"><div className="text-center"><h1 className="text-xl font-semibold">La page n'a pas pu se charger</h1><p className="mt-2 text-sm text-slate-500">Réessayez dans un instant.</p><button className="mt-5 rounded-xl border px-4 py-2" onClick={() => { router.invalidate(); reset(); }}>Réessayer</button></div></div>;
}
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [
    { charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title: "DEBS AI" }, { name: "description", content: "Votre assistant intelligent pour réfléchir, programmer et créer." },
    { name: "theme-color", content: "#f8fbff" }, { property: "og:title", content: "DEBS AI" },
    { property: "og:description", content: "Votre assistant intelligent." }, { property: "og:type", content: "website" },
  ], links: [
    { rel: "stylesheet", href: appCss }, { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    { rel: "manifest", href: "/manifest.webmanifest" }, { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap" },
  ] }),
  shellComponent: RootShell, component: RootComponent, notFoundComponent: NotFoundComponent, errorComponent: ErrorComponent,
});
function RootShell({ children }: { children: ReactNode }) {
  return <html lang="fr"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <QueryClientProvider client={queryClient}><AppShell><Outlet /></AppShell><Toaster theme="light" position="top-center" /></QueryClientProvider>;
}
