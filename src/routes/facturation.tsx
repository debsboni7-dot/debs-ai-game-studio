import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, FileText } from "lucide-react";
import { PageHeader, Panel } from "@/components/debs/ui";
export const Route = createFileRoute("/facturation")({
 head: () => ({ meta: [{ title: "Facturation — DEBS AI Studio" }] }),
 component: BillingPage,
});
function BillingPage() {
 return <div className="space-y-5">
  <PageHeader title="Facturation" />
  <Panel className="space-y-2 border-amber-200 bg-amber-50/60"><p className="font-semibold text-amber-900">Facturation non activée</p><p className="text-sm text-amber-800">Aucun paiement, renouvellement ou prélèvement automatique n'est actuellement disponible. Cette page ne présente pas de faux statut d'abonnement.</p></Panel>
  <Panel className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><CreditCard className="size-4"/> Moyens de paiement</h2><p className="text-sm text-muted-foreground">La connexion d'un prestataire compatible avec XOF, EUR et USD reste à configurer et à tester pour le compte marchand.</p><span className="w-fit rounded-full border px-2.5 py-1 text-xs text-slate-600">Aucun moyen de paiement connecté</span></Panel>
  <Panel className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><FileText className="size-4"/> Factures et reçus</h2><p className="text-sm text-muted-foreground">Les factures apparaîtront ici après activation d'un système de paiement vérifié.</p></Panel>
 </div>;
}
