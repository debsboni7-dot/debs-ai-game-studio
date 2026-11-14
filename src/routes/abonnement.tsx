import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Coins, CreditCard, Sparkles } from "lucide-react";
import { PageHeader, Panel } from "@/components/debs/ui";

export const Route = createFileRoute("/abonnement")({
  head: () => ({ meta: [{ title: "Abonnements — DEBS AI Studio" }, { name: "description", content: "Comparer les offres DEBS AI Studio." }] }),
  component: SubscriptionPage,
});

const plans = [
  { name: "Découverte", monthly: 0, annual: 0, credits: "100 000", duration: "1 heure", features: ["Chat standard", "Commandes slash essentielles", "Espace personnel", "Modèles économiques"] },
  { name: "Essentiel", monthly: 2500, annual: 25000, credits: "1 million", duration: "10 heures", features: ["Tout Découverte", "DEBS Code et édition de fichiers", "Lecture GitHub et propositions de modifications", "Génération de code et documents", "Modèles standards"] },
  { name: "Plus", monthly: 7500, annual: 75000, credits: "4 millions", duration: "24 heures", features: ["Tout Essentiel", "Agent multi-fichiers", "Recherche Web et analyse de projets", "Plusieurs projets", "Modèles avancés", "Tests si runtime isolé disponible"] },
  { name: "Pro", monthly: 20000, annual: 200000, credits: "12 millions", duration: "72 heures", features: ["Tout Plus", "Plusieurs dépôts", "Préparation de branches et Pull Requests", "Priorité d'exécution", "Modèles premium", "Workflows Unity, Unreal et Godot configurés"] },
  { name: "Studio", monthly: 50000, annual: 500000, credits: "35 millions", duration: "168 heures / 7 jours", features: ["Tout Pro", "Espaces d'équipe", "Agents spécialisés multiples", "Orchestration de projets complexes", "Priorité maximale"] },
];

function SubscriptionPage() {
  return <div className="space-y-5">
    <PageHeader title="Abonnements DEBS AI Studio" />
    <Panel className="space-y-2 border-amber-200 bg-amber-50/60">
      <p className="font-semibold text-amber-900">Catalogue en préparation · Paiements désactivés</p>
      <p className="text-sm text-amber-800">Les montants ci-dessous sont des propositions en XOF. Aucun abonnement ne peut être acheté pour le moment. Les prix EUR et USD devront être configurés séparément avant publication.</p>
    </Panel>
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((plan, index) => <Panel key={plan.name} className={index === 2 ? "space-y-3 border-red-300 shadow-sm" : "space-y-3"}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{plan.name}</h2>{index === 2 && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Populaire</span>}</div>
        <p className="text-2xl font-bold tabular-nums">{plan.monthly === 0 ? "Gratuit" : plan.monthly.toLocaleString("fr-FR")+" FCFA"}<span className="text-xs font-normal text-muted-foreground">{plan.monthly ? " / mois" : ""}</span></p>
        <p className="text-xs text-muted-foreground">{plan.annual === 0 ? "Sans frais" : plan.annual.toLocaleString("fr-FR")+" FCFA / an · 2 mois offerts"}</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-xs text-muted-foreground">Crédits mensuels</p><strong>{plan.credits}</strong></div><div><p className="text-xs text-muted-foreground">Mission max.</p><strong>{plan.duration}</strong></div></div>
        <ul className="space-y-2">{plan.features.map(item => <li key={item} className="flex gap-2 text-sm"><Check className="size-4 shrink-0 text-emerald-600"/><span>{item}</span></li>)}</ul>
        <button disabled className="w-full rounded-xl border bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-500">Bientôt disponible</button>
      </Panel>)}
    </div>
    <Panel className="space-y-2"><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4"/> Crédits supplémentaires</h2><p className="text-sm text-muted-foreground">Les packs de crédits pourront être achetés indépendamment d'un abonnement. Les crédits achetés n'expirent jamais. Le portefeuille sécurisé et les paiements ne sont pas encore activés.</p><Link to="/credits" className="text-sm font-semibold text-red-700">Voir les packs proposés →</Link></Panel>
  </div>;
}
