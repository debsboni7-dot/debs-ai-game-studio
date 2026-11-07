import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/debs/ui";
import { GitBranch, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type RepoFile = { path: string; size: number | null };

export function GitHubAgentPanel() {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inspect = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("github-agent", {
        body: { action: "inspect" },
      });
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error ?? "Inspection GitHub impossible.");
      setFiles(data.files ?? []);
      setBranch(data.branch ?? "");
      setNotice("Connexion serveur active : " + data.repository + ". " + (data.truncated ? "Liste partielle." : "Arborescence chargée."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de contacter l'agent GitHub.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-3 border-violet-200 bg-white/90">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><GitBranch className="size-5" /></span>
        <div><h3 className="font-semibold">Agent GitHub côté serveur</h3><p className="text-xs text-muted-foreground">Vérification réelle des secrets et lecture du dépôt autorisé</p></div>
      </div>
      <p className="text-sm text-muted-foreground">Cet agent utilise un jeton stocké dans les secrets Supabase, séparé du jeton GitHub temporaire utilisé dans cette page. Il pourra créer des branches et des PR brouillons sans écrire sur main.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={inspect}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
        Tester la connexion serveur
      </Button>
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><ShieldCheck className="mr-1 inline size-4" />{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
      {branch && <div className="space-y-1 rounded-xl border bg-slate-50 p-3"><p className="text-xs font-semibold">Branche : {branch}</p><p className="text-xs text-muted-foreground">{files.length} fichiers listés</p><div className="max-h-36 overflow-y-auto font-mono text-[11px] text-slate-600">{files.slice(0, 30).map((file) => <p key={file.path}>{file.path}</p>)}</div></div>}
      <p className="text-[11px] leading-5 text-muted-foreground">Configuration requise dans Supabase Edge Function Secrets : GITHUB_TOKEN, GITHUB_REPOSITORY et GITHUB_BASE_BRANCH. Si ces secrets ne sont pas définis, le test retournera une erreur de configuration. Le jeton ne doit jamais être saisi ici.</p>
    </Panel>
  );
}
