import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "@/components/debs/ui";

export const Route = createFileRoute("/credits")({
  head: () => ({
    meta: [
      { title: "Crédits — DEBS AI Studio" },
      { name: "description", content: "Règles des soldes de crédits DEBS." },
    ],
  }),
  component: CreditsPage,
});

function CreditsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Crédits DEBS" />
      <Panel className="space-y-2 border-amber-200 bg-amber-50/60">
        <p className="font-semibold text-amber-900">Portefeuille non activé</p>
        <p className="text-sm text-amber-800">
          Aucun solde réel n'est encore affiché. Les crédits ne peuvent pas être achetés séparément.
          Le second compartiment est réservé aux crédits de compensation ou aux avoirs accordés
          par DEBS AI Studio.
        </p>
      </Panel>
      <Panel className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" /> Règles des crédits
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Les crédits mensuels de l'abonnement sont reportés intégralement.</li>
          <li>Une rétrogradation ne supprime ni ne plafonne les crédits déjà accumulés.</li>
          <li>Les crédits de compensation et les avoirs n'expirent pas.</li>
          <li>Aucun pack ni achat de crédits indépendant d'un abonnement n'est proposé.</li>
          <li>Les dépenses utilisent d'abord les crédits d'abonnement, puis les crédits de compensation.</li>
        </ul>
      </Panel>
    </div>
  );
}
