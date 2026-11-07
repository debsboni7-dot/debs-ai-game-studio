import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/debs/ui";
import { integrations, type IntegrationStatus } from "@/lib/integrations/registry";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Intégrations — DEBS AI" },
      { name: "description", content: "GitHub, Godot, Unity, Unreal, Blender et modèles IA." },
      { property: "og:title", content: "Intégrations — DEBS AI" },
      { property: "og:description", content: "Connecteurs disponibles et à venir." },
    ],
  }),
  component: Integrations,
});

const tone: Record<IntegrationStatus, string> = {
  ready: "border-primary/40 bg-primary/10 text-primary",
  connected: "border-success/40 bg-success/10 text-success",
  planned: "border-border bg-muted text-muted-foreground",
};

function Integrations() {
  const connected = integrations.filter((i) => i.status === "connected").length;
  return (
    <div>
      <PageHeader title="Intégrations" subtitle={`${connected} connectée(s). Aucune connexion n'est simulée.`} />
      <Panel className="mb-4 flex gap-3 text-sm text-muted-foreground">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        Les clés et jetons seront stockés côté serveur uniquement. Toute écriture ou exécution demandera votre confirmation explicite.
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        {integrations.map((i) => (
          <Panel key={i.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{i.name}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[0.7rem] ${tone[i.status]}`}>{t(`status.${i.status}`)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{i.description}</p>
            <p className="text-xs text-muted-foreground">Auth prévue : {i.plannedAuth}</p>
            <Button size="sm" variant="secondary" disabled className="mt-auto">
              {i.status === "planned" ? "Bientôt" : "Connexion pas encore activée"}
            </Button>
          </Panel>
        ))}
      </div>
    </div>
  );
}
