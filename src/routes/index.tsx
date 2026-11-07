import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, Gamepad2, MessageSquareCode, Plug } from "lucide-react";
import { DemoBadge, Logo, Panel } from "@/components/debs/ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DEBS AI — Atelier IA de code et de jeux" },
      { name: "description", content: "Tableau de bord DEBS AI : chat de code, atelier, studio de jeux." },
      { property: "og:title", content: "DEBS AI — Tableau de bord" },
      { property: "og:description", content: "Assistant de programmation et de création de jeux vidéo." },
    ],
  }),
  component: Index,
});

const cards = [
  { to: "/chat", icon: MessageSquareCode, title: "Chat de code", text: "Conversations et blocs de code." },
  { to: "/atelier", icon: Code2, title: "Atelier", text: "Fichiers, éditeur et export ZIP." },
  { to: "/studio", icon: Gamepad2, title: "Studio de jeux", text: "Cahier des charges et checklist." },
  { to: "/integrations", icon: Plug, title: "Intégrations", text: "GitHub, moteurs, modèles IA." },
] as const;

function Index() {
  return (
    <div className="animate-rise space-y-6">
      <section className="rounded-2xl border bg-card p-6 shadow-glow">
        <Logo className="size-12" />
        <h1 className="mt-4 text-3xl font-bold">
          DEBS <span className="text-gradient-brand">AI</span>
        </h1>
        <p className="mt-2 text-muted-foreground">Votre atelier pour programmer et créer des jeux vidéo.</p>
        <div className="mt-4">
          <DemoBadge label="Mode démo — aucun modèle IA connecté" />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Panel className="h-full transition-colors hover:border-primary/60">
              <c.icon className="size-5 text-primary" />
              <p className="mt-3 font-medium">{c.title}</p>
              <p className="text-sm text-muted-foreground">{c.text}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
