import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
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

const sel = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

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
        <h2 className="font-semibold">Profil</h2>
        <label className="block text-sm">Nom affiché<Input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} placeholder="Votre nom" /></label>
        <p className="text-xs text-muted-foreground">Enregistré dans ce navigateur (pas encore de compte).</p>
      </Panel>
      <Panel className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Langue<select className={sel} defaultValue="fr"><option value="fr" className="bg-popover">Français</option><option disabled className="bg-popover">English (bientôt)</option></select></label>
        <label className="text-sm">Thème<select className={sel} defaultValue="graphite"><option value="graphite" className="bg-popover">Graphite (par défaut)</option></select></label>
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
