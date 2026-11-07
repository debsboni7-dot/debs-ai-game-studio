import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FilePlus, FileCode, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DemoBadge, EmptyState, PageHeader } from "@/components/debs/ui";
import { CodeBlock } from "@/components/debs/code-block";
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage";
import { demoFiles, exportZip, languageFor, normalizePath, type WorkFile } from "@/lib/workshop/files";

export const Route = createFileRoute("/atelier")({
  head: () => ({
    meta: [
      { title: "Atelier de code — DEBS AI" },
      { name: "description", content: "Éditez les fichiers de votre projet et exportez-les en ZIP." },
      { property: "og:title", content: "Atelier de code — DEBS AI" },
      { property: "og:description", content: "Éditeur de fichiers de projet." },
    ],
  }),
  component: Atelier,
});

function Atelier() {
  const [files, setFiles] = usePersistentState<WorkFile[]>(STORAGE_KEYS.workshop, demoFiles);
  const [active, setActive] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const current = files.find((f) => f.path === active) ?? files[0];
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const add = () => {
    const p = normalizePath(window.prompt("Chemin du nouveau fichier (ex. scripts/enemy.gd)") ?? "");
    if (!p) return;
    if (files.some((f) => f.path === p)) {
      toast.error("Ce fichier existe déjà.");
      return;
    }
    setFiles((prev) => [...prev, { path: p, content: "" }]);
    setActive(p);
  };
  const rename = () => {
    if (!current) return;
    const p = normalizePath(window.prompt("Nouveau chemin", current.path) ?? "");
    if (!p || p === current.path) return;
    if (files.some((f) => f.path === p)) {
      toast.error("Ce chemin est déjà pris.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.path === current.path ? { ...f, path: p } : f)));
    setActive(p);
  };
  const remove = () => {
    if (!current || !window.confirm(`Supprimer ${current.path} ?`)) return;
    setFiles((prev) => prev.filter((f) => f.path !== current.path));
    setActive(null);
  };

  return (
    <div>
      <PageHeader title="Atelier" subtitle="Le code est édité ici, jamais exécuté." action={<DemoBadge label="Fichiers de démo" />} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={add}><FilePlus /> Fichier</Button>
        <Button size="sm" variant="secondary" onClick={rename} disabled={!current}><Pencil /> Renommer</Button>
        <Button size="sm" variant="secondary" onClick={remove} disabled={!current}><Trash2 /> Supprimer</Button>
        <Button size="sm" onClick={() => exportZip(files)} disabled={!files.length}><Download /> ZIP</Button>
      </div>
      {!current ? (
        <EmptyState icon={<FileCode />} title="Aucun fichier" text="Créez un fichier pour commencer." />
      ) : (
        <div className="grid gap-3 md:grid-cols-[200px_1fr]">
          <ul className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 md:flex-col">
            {sorted.map((f) => (
              <li key={f.path}>
                <button onClick={() => setActive(f.path)} className={`w-full whitespace-nowrap rounded px-2 py-1.5 text-left font-mono text-xs ${f.path === current.path ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {f.path}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 space-y-2">
            <div className="flex gap-2 text-xs">
              <button onClick={() => setPreview(false)} className={!preview ? "text-primary" : "text-muted-foreground"}>Éditer</button>
              <button onClick={() => setPreview(true)} className={preview ? "text-primary" : "text-muted-foreground"}>Aperçu</button>
            </div>
            {preview ? (
              <CodeBlock code={current.content} language={languageFor(current.path)} />
            ) : (
              <textarea
                aria-label={`Contenu de ${current.path}`}
                spellCheck={false}
                value={current.content}
                onChange={(e) => setFiles((prev) => prev.map((f) => (f.path === current.path ? { ...f, content: e.target.value } : f)))}
                className="h-[55vh] w-full resize-none rounded-lg border bg-code p-3 font-mono text-[0.8rem] outline-none focus:border-primary"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
