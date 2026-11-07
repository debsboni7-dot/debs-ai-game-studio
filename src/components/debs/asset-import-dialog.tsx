import { useState } from "react";
import { Download, ExternalLink, Loader2, PackageOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type ImportResult = { ok?: boolean; imported?: number; bytes?: number; branch?: string; pull_request?: string; manifest?: string; error?: string };

export function AssetImportDialog() {
  const [open, setOpen] = useState(false);
  const [packName, setPackName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [licenseName, setLicenseName] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [licenseEvidence, setLicenseEvidence] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setResult(null); setPackName(""); setSourceUrl(""); setLicenseName(""); setLicenseUrl(""); setLicenseEvidence(""); };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Connecte-toi à ton compte DEBS AI avant d'importer des ressources.");
      const { data, error } = await supabase.functions.invoke("asset-import", {
        body: { pack_name: packName, source_url: sourceUrl, license_name: licenseName, license_url: licenseUrl, license_evidence: licenseEvidence },
      });
      if (error) throw new Error(error.message || "Le service d'importation n'est pas disponible.");
      const payload = data as ImportResult;
      if (!payload?.ok) throw new Error(payload?.error || "L'importation n'a pas abouti.");
      setResult(payload);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Erreur d'importation inconnue." });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Importer des assets de jeu" title="Importer des assets de jeu" className="shrink-0 border-red-200 text-red-700 hover:bg-red-50">
          <PackageOpen className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageOpen className="size-5 text-red-600" /> Importer des ressources de jeu</DialogTitle>
          <DialogDescription>DEBS télécharge l'archive depuis une source approuvée, vérifie les fichiers et prépare une Pull Request dans ton dépôt GitHub. Rien n'est fusionné automatiquement.</DialogDescription>
        </DialogHeader>
        {result?.ok ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5" /> Import préparé : {result.imported} fichier(s)</p>
            <p>{((result.bytes ?? 0) / 1024 / 1024).toFixed(2)} Mo · branche {result.branch}</p>
            {result.pull_request && <a className="inline-flex items-center gap-1 font-medium underline" href={result.pull_request} target="_blank" rel="noreferrer">Ouvrir la Pull Request <ExternalLink className="size-3" /></a>}
            <p className="text-xs">Les fichiers sont dans la branche de proposition. Vérifie leur intégration au moteur et la licence avant toute fusion.</p>
            <Button type="button" onClick={reset} variant="outline" className="w-full">Importer un autre pack</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <a href="https://kenney.nl/assets" target="_blank" rel="noreferrer" className="rounded-lg border p-2 hover:border-red-300">Kenney <ExternalLink className="inline size-3" /></a>
              <a href="https://quaternius.com/" target="_blank" rel="noreferrer" className="rounded-lg border p-2 hover:border-red-300">Quaternius <ExternalLink className="inline size-3" /></a>
              <a href="https://polyhaven.com/" target="_blank" rel="noreferrer" className="rounded-lg border p-2 hover:border-red-300">Poly Haven <ExternalLink className="inline size-3" /></a>
              <a href="https://ambientcg.com/" target="_blank" rel="noreferrer" className="rounded-lg border p-2 hover:border-red-300">ambientCG <ExternalLink className="inline size-3" /></a>
            </div>
            <label className="block space-y-1 text-xs font-medium">Nom du pack<Input value={packName} onChange={(e) => setPackName(e.target.value)} maxLength={100} required placeholder="Ex. Medieval Props Pack" /></label>
            <label className="block space-y-1 text-xs font-medium">Lien direct HTTPS vers une archive ZIP<Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} type="url" required placeholder="https://.../asset-pack.zip" /></label>
            <p className="text-[11px] text-muted-foreground">Les pages de catalogue ne sont pas des liens de téléchargement. Le service accepte uniquement les domaines autorisés et les liens directs vers ZIP.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium">Licence exacte<Input value={licenseName} onChange={(e) => setLicenseName(e.target.value)} required placeholder="CC0 1.0 / QAL v1.0..." /></label>
              <label className="block space-y-1 text-xs font-medium">URL officielle de la licence<Input value={licenseUrl} onChange={(e) => setLicenseUrl(e.target.value)} type="url" required placeholder="https://..." /></label>
            </div>
            <label className="block space-y-1 text-xs font-medium">Preuve lue sur la page officielle ou dans le pack<Textarea value={licenseEvidence} onChange={(e) => setLicenseEvidence(e.target.value)} minLength={20} required rows={3} placeholder="Copie une courte indication des droits d'utilisation et des restrictions..." /></label>
            {result?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{result.error}</p>}
            <p className="text-[11px] text-muted-foreground">Limites actuelles : ZIP jusqu'à 12 Mo, 60 fichiers et 18 Mo extraits. Les assets payants, protégés ou nécessitant une connexion ne sont pas contournés.</p>
            <Button type="submit" disabled={loading} className="w-full"><span className="inline-flex items-center gap-2">{loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{loading ? "Téléchargement et préparation…" : "Télécharger et préparer l'import"}</span></Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
