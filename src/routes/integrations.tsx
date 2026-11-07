import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Box, Check, CheckCircle2, Code2, ExternalLink, FileCode2, GitBranch, Gamepad2, Layers3, Loader2, LockKeyhole, PlugZap, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/debs/ui";
import { connectGitHub, listGitHubRepositoryFiles, readGitHubRepositoryFiles } from "@/lib/integrations/github.functions";
import { useIntegrations } from "@/lib/integrations/context";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [
    { title: "Intégrations — DEBS AI" },
    { name: "description", content: "Connecteurs de développement et moteurs de jeu pour DEBS AI." },
  ] }),
  component: IntegrationsPage,
});

const engines = [
  { id: "unity", name: "Unity", command: "/unity", detail: "C#, MonoBehaviour, ScriptableObjects, scènes, prefabs et architecture Unity.", status: "Spécialisation IA active", icon: Gamepad2 },
  { id: "unreal", name: "Unreal Engine", command: "/unreal", detail: "C++, gameplay framework, UObjects, Blueprints décrits et pipelines Unreal.", status: "Spécialisation IA active", icon: Box },
  { id: "godot", name: "Godot", command: "/godot", detail: "GDScript, scènes .tscn, ressources .tres, signaux et nœuds.", status: "Spécialisation IA active", icon: Layers3 },
  { id: "blender", name: "Blender", command: "/blender", detail: "Python bpy, modélisation procédurale, matériaux, rigging et export d'assets.", status: "Spécialisation IA active", icon: Code2 },
  { id: "threejs", name: "Three.js / WebGL", command: "/threejs", detail: "Scènes 3D web, géométrie, shaders, contrôles et optimisation navigateur.", status: "Spécialisation IA active", icon: FileCode2 },
];

function IntegrationsPage() {
  const navigate = useNavigate();
  const {
    githubToken, githubUser, repositories, selectedRepository, repositoryContext, contextFiles,
    connectGitHub: saveConnection, disconnectGitHub, selectRepository, setRepositoryContext,
  } = useIntegrations();
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState<"connect" | "files" | "import" | null>(null);
  const [error, setError] = useState("");
  const [fileList, setFileList] = useState<{ path: string; size: number }[]>([]);
  const [branch, setBranch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  const doConnect = async () => {
    setBusy("connect"); setError("");
    try {
      const result = await connectGitHub({ data: { token: tokenInput.trim() } });
      saveConnection(tokenInput.trim(), result.user, result.repositories);
      setTokenInput("");
      setFileList([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connexion GitHub impossible.");
    } finally { setBusy(null); }
  };

  const loadFiles = async () => {
    if (!githubToken || !selectedRepository) return;
    setBusy("files"); setError("");
    try {
      const result = await listGitHubRepositoryFiles({ data: { token: githubToken, fullName: selectedRepository.fullName } });
      setBranch(result.branch);
      setFileList(result.files);
      const recommended = result.files
        .filter((file) => ["README.md", "package.json", "AGENTS.md", "project.godot", "Packages/manifest.json"].includes(file.path))
        .map((file) => file.path);
      setSelectedPaths((recommended.length ? recommended : result.files.slice(0, 4).map((file) => file.path)).slice(0, 6));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lire les fichiers du dépôt.");
    } finally { setBusy(null); }
  };

  const importFiles = async () => {
    if (!githubToken || !selectedRepository || !selectedPaths.length) return;
    setBusy("import"); setError("");
    try {
      const result = await readGitHubRepositoryFiles({ data: {
        token: githubToken, fullName: selectedRepository.fullName, branch, paths: selectedPaths,
      } });
      const context = [
        "DÉPÔT GITHUB ACTIF : " + selectedRepository.fullName,
        "Branche inspectée : " + branch,
        "Fichiers source importés pour cette conversation. C'est un instantané en lecture seule, pas un accès d'écriture en direct.",
        ...result.files.map((file) => "\n--- FICHIER : " + file.path + " ---\n" + file.content),
      ].join("\n");
      setRepositoryContext(context, result.files.map((file) => file.path));
      await navigate({ to: "/chat" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import des fichiers impossible.");
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Intégrations & développement" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Relie tes dépôts et choisis le moteur de jeu. DEBS AI sépare les accès aux outils de son modèle IA : une action distante ne doit jamais être exécutée sans autorisation.
      </p>

      <Panel className="space-y-4 border-blue-200/80 bg-white/90 shadow-[0_16px_50px_-34px_rgba(60,120,255,.45)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="glow-icon flex size-11 items-center justify-center rounded-2xl"><GitBranch className="size-5" /></span>
            <div><h2 className="font-semibold">GitHub</h2><p className="text-xs text-muted-foreground">Dépôts, branches et fichiers source</p></div>
          </div>
          {githubUser ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Connecté en mémoire</span> : <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">À connecter</span>}
        </div>

        {githubUser ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50/80 p-3">
              <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-emerald-600" /><span>Compte <strong>{githubUser.login}</strong></span></div>
              <Button type="button" variant="outline" size="sm" onClick={disconnectGitHub}><Unplug className="mr-2 size-4" /> Déconnecter</Button>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">Dépôt à analyser
              <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={selectedRepository?.fullName ?? ""} onChange={(event) => {
                const next = repositories.find((repo) => repo.fullName === event.target.value) ?? null;
                selectRepository(next); setFileList([]); setBranch(""); setSelectedPaths([]);
              }}>
                {repositories.map((repo) => <option key={repo.id} value={repo.fullName}>{repo.fullName}{repo.isPrivate ? " · privé" : ""}</option>)}
              </select>
            </label>
            {selectedRepository && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Branche par défaut : {selectedRepository.defaultBranch}</span>
              <span>{selectedRepository.canPush ? "Accès écriture détecté" : "Lecture seule"}</span>
            </div>}
            <Button type="button" variant="outline" disabled={!selectedRepository || busy !== null} onClick={loadFiles}>
              {busy === "files" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Charger les fichiers du dépôt
            </Button>
            {fileList.length > 0 && (
              <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <div><h3 className="text-sm font-semibold">Choisis le contexte à donner à l'IA</h3><p className="text-xs text-muted-foreground">6 fichiers maximum · fichiers texte uniquement · secrets et fichiers .env exclus.</p></div>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {fileList.map((file) => (
                    <label key={file.path} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white/80">
                      <input type="checkbox" checked={selectedPaths.includes(file.path)} disabled={!selectedPaths.includes(file.path) && selectedPaths.length >= 6} onChange={(event) => setSelectedPaths((current) => event.target.checked ? [...current, file.path] : current.filter((path) => path !== file.path))} />
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{file.path}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{Math.round(file.size / 1024)} Ko</span>
                    </label>
                  ))}
                </div>
                <Button type="button" disabled={busy !== null || selectedPaths.length === 0} onClick={importFiles}>
                  {busy === "import" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} Importer dans le contexte du chat
                </Button>
              </div>
            )}
            {repositoryContext && <p className="text-xs text-emerald-700">{contextFiles.length} fichier(s) déjà chargé(s) dans le contexte courant.</p>}
          </div>
        ) : (
          <Panel className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Catalogue de connecteurs</h2><p className="mt-1 text-sm text-muted-foreground">{connectors.length} services référencés · plusieurs familles d'outils</p></div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Catalogue extensible</span>
        </div>
        <Input value={connectorSearch} onChange={(event) => setConnectorSearch(event.target.value)} placeholder="Rechercher Meshy, Tripo, GitHub, Kenney…" className="h-11 rounded-xl border-blue-100 bg-white" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setConnectorCategory("all")} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${connectorCategory === "all" ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-white text-slate-600 hover:border-blue-300"}`}>Tous ({connectors.length})</button>
          {connectorCategories.map((category) => <button key={category.id} type="button" onClick={() => setConnectorCategory(category.id)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${connectorCategory === category.id ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-white text-slate-600 hover:border-blue-300"}`}>{category.label}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredConnectors.map((connector) => (
            <article key={connector.id} className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 transition hover:border-blue-300 hover:shadow-[0_10px_35px_-25px_rgba(37,99,235,.55)] ${connector.priority ? "border-blue-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="font-semibold text-slate-900">{connector.name}</h3><p className="mt-1 text-[11px] font-medium text-blue-700">{connectorIntegrationLabel(connector.integration)}</p></div>
                {connector.priority && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">Prioritaire</span>}
              </div>
              <p className="flex-1 text-xs leading-5 text-slate-600">{connector.description}</p>
              {connector.note && <p className="text-[11px] text-blue-700">{connector.note}</p>}
              <a href={connector.website} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Site officiel <ExternalLink className="size-3" /></a>
            </article>
          ))}
        </div>
        {filteredConnectors.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-muted-foreground">Aucun connecteur ne correspond à cette recherche.</p>}
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">Ce catalogue présente les intégrations ciblées, pas des connexions déjà actives. Chaque service devra recevoir son adaptateur réel (OAuth, API, agent local ou import), ses permissions et ses tests. Les clés secrètes ne doivent jamais être placées dans le navigateur ou dans les conversations.</p>
      </Panel>

      <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Connecte un jeton d'accès personnel GitHub finement limité. Il sera vérifié côté serveur puis gardé uniquement en mémoire jusqu'à la fermeture ou l'actualisation de l'application.</p>
            <label className="block space-y-1.5 text-sm font-medium">Jeton GitHub
              <Input type="password" autoComplete="off" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="github_pat_…" className="h-11 rounded-xl" />
            </label>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-600">
              <p className="flex items-center gap-2 font-semibold text-slate-800"><ShieldCheck className="size-4 text-blue-600" /> Autorisations minimales requises</p>
              <p className="mt-1">Metadata : lecture seule · Contents : lecture seule. Limite le jeton aux dépôts que tu veux connecter.</p>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-700">Créer un jeton GitHub <ExternalLink className="size-3" /></a>
            </div>
            <Button type="button" disabled={busy !== null || !tokenInput.trim()} onClick={doConnect}>
              {busy === "connect" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PlugZap className="mr-2 size-4" />} Vérifier et connecter GitHub
            </Button>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" /> Le jeton n'est ni enregistré dans le compte, ni placé dans les messages, ni envoyé au modèle IA. Il est transmis au serveur uniquement pour appeler l'API GitHub et disparaît au rechargement.</p>
      </Panel>

      <div className="space-y-3">
        <div><h2 className="font-semibold">Moteurs et outils de création</h2><p className="text-xs text-muted-foreground">Les spécialisations sont actives dans le chat. Les agents qui pilotent directement les éditeurs et lancent des builds restent à raccorder.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {engines.map((engine) => {
            const Icon = engine.icon;
            return <Panel key={engine.id} className="space-y-3">
              <div className="flex items-center gap-3"><span className="glow-icon flex size-10 items-center justify-center rounded-xl"><Icon className="size-5" /></span><div><h3 className="font-semibold">{engine.name}</h3><p className="text-[11px] font-medium text-emerald-700">{engine.status}</p></div></div>
              <p className="text-sm text-muted-foreground">{engine.detail}</p>
              <div className="flex items-center justify-between gap-2 border-t pt-2"><code className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-blue-700">{engine.command}</code><span className="text-[10px] text-muted-foreground">Agent éditeur : à connecter</span></div>
            </Panel>;
          })}
        </div>
      </div>

      <Panel className="space-y-2">
        <h2 className="font-semibold">Ce qui n'est pas encore activé</h2>
        <p className="text-sm text-muted-foreground">L'import GitHub permet actuellement à l'IA de lire un instantané des fichiers sélectionnés. Les commits, branches, pull requests automatiques, le contrôle direct de Unity/Unreal/Blender et les builds nécessitent une couche d'exécution séparée avec validation explicite. Rien n'est présenté comme connecté tant que ce pont n'existe pas.</p>
      </Panel>
    </div>
  );
}
