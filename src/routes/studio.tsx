import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Gamepad2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DemoBadge, EmptyState, PageHeader, Panel } from "@/components/debs/ui";
import { Markdown } from "@/components/debs/markdown";
import { STORAGE_KEYS, readStorage, uid, usePersistentState, writeStorage } from "@/lib/storage";
import { engineLabels, generateGameTemplate, type Engine, type GameProject } from "@/lib/game/spec";
import { demoFiles, type WorkFile } from "@/lib/workshop/files";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio de jeux — DEBS AI" },
      { name: "description", content: "Préparez le cahier des charges et la structure de votre jeu." },
      { property: "og:title", content: "Studio de jeux — DEBS AI" },
      { property: "og:description", content: "Assistant de création de jeux vidéo." },
    ],
  }),
  component: Studio,
});

const sel = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

function Studio() {
  const [games, setGames] = usePersistentState<GameProject[]>(STORAGE_KEYS.games, []);
  const [form, setForm] = useState({ name: "", engine: "godot" as Engine, genre: "", platform: "Android" });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = games.find((g) => g.id === openId);
  const update = (id: string, patch: Partial<GameProject>) => setGames((p) => p.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Donnez un nom au jeu.");
    const g: GameProject = { ...form, id: uid("g_"), createdAt: Date.now(), notes: "", ...generateGameTemplate(form) };
    setGames((p) => [g, ...p]);
    setOpenId(g.id);
  };
  const toWorkshop = (g: GameProject) => {
    const files = readStorage<WorkFile[]>(STORAGE_KEYS.workshop, demoFiles);
    const added = g.structure.filter((p) => !files.some((f) => f.path === p)).map((path) => ({ path, content: "" }));
    writeStorage(STORAGE_KEYS.workshop, [...files, ...added]);
    toast.success(`${added.length} fichier(s) ajouté(s) à l'atelier.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Studio de jeux" subtitle="Les sorties sont des modèles d'exemple tant qu'aucune IA n'est connectée." />
      <Panel>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Nom du jeu<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Neon Runner" /></label>
          <label className="text-sm">Moteur
            <select className={sel} value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as Engine })}>
              {Object.entries(engineLabels).map(([k, v]) => <option key={k} value={k} className="bg-popover">{v}</option>)}
            </select>
          </label>
          <label className="text-sm">Genre<Input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} placeholder="Plateforme, RPG…" /></label>
          <label className="text-sm">Plateforme<Input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} /></label>
          <Button type="submit" className="sm:col-span-2">Générer le cahier des charges (modèle)</Button>
        </form>
      </Panel>

      {games.length === 0 ? (
        <EmptyState icon={<Gamepad2 />} title="Aucun projet de jeu" text="Remplissez le formulaire pour créer votre premier projet." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {games.map((g) => (
            <Button key={g.id} size="sm" variant={g.id === openId ? "default" : "secondary"} onClick={() => setOpenId(g.id)}>{g.name}</Button>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-4 animate-rise">
          <div className="flex items-center justify-between gap-2">
            <DemoBadge label={`Exemple · ${engineLabels[open.engine]}`} />
            <Button size="sm" variant="ghost" onClick={() => { setGames((p) => p.filter((g) => g.id !== open.id)); setOpenId(null); }}><Trash2 /> Supprimer</Button>
          </div>
          <Panel><Markdown>{open.spec}</Markdown></Panel>
          <Panel>
            <h2 className="mb-2 font-semibold">Checklist</h2>
            {open.checklist.map((c, i) => (
              <label key={i} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" className="accent-primary" checked={c.done} onChange={() => update(open.id, { checklist: open.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
              </label>
            ))}
          </Panel>
          <Panel>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Structure du projet</h2><Button size="sm" variant="secondary" onClick={() => toWorkshop(open)}>Envoyer à l'atelier</Button></div>
            <ul className="font-mono text-xs text-muted-foreground">{open.structure.map((s) => <li key={s}>{s}</li>)}</ul>
          </Panel>
          <Panel>
            <h2 className="mb-2 font-semibold">Scripts & assets (notes)</h2>
            <Textarea value={open.notes} onChange={(e) => update(open.id, { notes: e.target.value })} placeholder="Idées de scripts, liste d'assets à produire…" />
          </Panel>
        </div>
      )}
    </div>
  );
}
