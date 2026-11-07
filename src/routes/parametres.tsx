import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, Monitor, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/debs/ui";
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage";

export const Route = createFileRoute("/parametres")({
  head: () => ({
    meta: [
      { title: "Réglages — DEBS AI" },
      { name: "description", content: "Profil, langue, thème et clés API côté serveur." },
      { property: "og:title", content: "Réglages — DEBS AI" },
      { property: "og:description", content: "Paramètres de DEBS AI." },
    ],
  }),
  component: Settings,
});


function Settings() {
  const [profile, setProfile] = usePersistentState(STORAGE_KEYS.profile, { name: "" });
  const reset = () => {
    if (!window.confirm("Effacer toutes les données locales (conversations, fichiers, jeux) ?")) return;
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    toast.success("Données locales effacées.");
    setTimeout(() => location.reload(), 600);
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Réglages" />
      <Panel className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><UserRound className="size-4 text-primary" /> Profil</h2>
        <label className="block space-y-1.5 text-sm">Nom affiché<Input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="Votre nom" /></label>
        <p className="text-xs text-muted-foreground">Ce nom est enregistré localement sur cet appareil. Il ne modifie pas ton identité de compte.</p>
      </Panel>
      <Panel className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold"><Monitor className="size-4 text-primary" /> Apparence et langue</h2>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-white p-3 shadow-[0_6px_24px_-20px_rgba(220,38,38,.65)]">
          <div><p className="text-sm font-medium text-slate-800">Thème clair lumineux</p><p className="text-xs text-muted-foreground">Fond blanc, panneaux clairs et contours lumineux rouges.</p></div>
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">Actif</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
          <div><p className="text-sm font-medium text-slate-800">Langue de l’interface</p><p className="text-xs text-muted-foreground">Français · les autres langues ne sont pas encore intégralement traduites.</p></div>
          <span className="text-xs font-semibold text-slate-600">Français</span>
        </div>
      </Panel>
      <Panel className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" /> Clés API</h2>
        <p className="text-sm text-muted-foreground">
          Aucune clé ne se saisit ici. Les clés seront ajoutées comme secrets côté serveur lors de la mise en place réelle d'une intégration. Ne collez jamais de clé dans le chat.
        </p>
        <Link to="/integrations" className="text-sm text-primary">Voir les intégrations →</Link>
      </Panel>
      <Button variant="destructive" onClick={reset}>Effacer les données locales</Button>
    </div>
  );
}
