import { createFileRoute } from "@tanstack/react-router";
import { Coins, ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "@/components/debs/ui";

export const Route = createFileRoute("/credits")({
  head: () => ({ meta: [{ title: "Crédits — DEBS AI Studio" }, { name: "description", content: "Packs de crédits DEBS." }] }),
  component: CreditsPage,
});
const packs = [
  { name: "Mini", credits: "500 000", price: "2 000 FCFA" },
  { name: "Standard", credits: "2 000 000", price: "6 500 FCFA" },
  { name: "Avancé", credits: "5 000 000", price: "15 000 FCFA" },
  { name: "Studio", credits: "15 000 000", price: "40 000 FCFA" },
];
function CreditsPage() {
 return <div className="space-y-5">
  <PageHeader title="Crédits DEBS" />
  <Panel className="space-y-2 border-amber-200 bg-amber-50/60"><p className="font-semibold text-amber-900">Portefeuille non activé</p><p className="text-sm text-amber-800">Aucun solde réel n'est encore disponible ici. Les achats seront activés uniquement après mise en place du portefeuille serveur, du registre comptable et d'un prestataire de paiement vérifié.</p></Panel>
  <Panel className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4"/> Règles de conservation validées</h2><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>Les crédits achetés séparément n'expirent jamais.</li><li>Les crédits non utilisés de l'abonnement sont reportés intégralement.</li><li>Une rétrogradation ne supprime ni ne plafonne les crédits déjà accumulés.</li><li>Les crédits d'abonnement et les crédits achetés restent comptabilisés séparément.</li></ul></Panel>
  <div className="grid gap-3 sm:grid-cols-2">{packs.map(pack=><Panel key={pack.name} className="space-y-2"><h3 className="font-semibold">{pack.name}</h3><p className="text-2xl font-bold">{pack.credits}</p><p className="text-sm text-muted-foreground">Crédits DEBS · achat indépendant</p><p className="font-semibold">{pack.price}</p><button disabled className="w-full rounded-xl border bg-slate-100 px-3 py-2 text-sm text-slate-500">Achat indisponible</button></Panel>)}</div>
  <p className="text-xs text-muted-foreground">Les prix des packs sont indicatifs et doivent être validés après calcul des coûts réels des modèles et outils. Les montants EUR et USD seront publiés séparément.</p>
 </div>;
}
