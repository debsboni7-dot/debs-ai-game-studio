import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, BrainCircuit, Check, CircleAlert, Database, FileJson, FlaskConical, Loader2, Plus, RefreshCw, Rocket, ShieldCheck, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/ai-lab")({
  head: () => ({ meta: [{ title: "Laboratoire IA — DEBS AI" }, { name: "description", content: "Administration des datasets, entraînements et versions de DEBS AI." }] }),
  component: AILabPage,
});

type LabData = {
  datasets: any[]; jobs: any[]; releases: any[]; knowledge: any[]; events: any[];
};
const empty: LabData = { datasets: [], jobs: [], releases: [], knowledge: [], events: [] };
const statusLabel: Record<string,string> = {
  draft:"Brouillon", review:"À vérifier", approved:"Approuvé", queued:"En attente GPU",
  preparing:"Préparation", training:"Entraînement", evaluating:"Évaluation",
  awaiting_approval:"Validation requise", active:"Actif", archived:"Archivé",
  rejected:"Refusé", approved:"Approuvé, non déployé", failed:"Échec", cancelled:"Annulé",
};

function AILabPage() {
  const [data, setData] = useState<LabData>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview"|"datasets"|"training"|"models"|"memory">("overview");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [examples, setExamples] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeConsent, setKnowledgeConsent] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [modelLicenseReviewed, setModelLicenseReviewed] = useState(false);
  const [trainingMethod, setTrainingMethod] = useState<"lora"|"qlora">("qlora");

  const api = useCallback(async (action?: string, payload: Record<string,unknown> = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Session expirée. Reconnecte-toi.");
    const response = await fetch("/api/ai-lab", {
      method: action ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(action ? { "Content-Type": "application/json" } : {}) },
      body: action ? JSON.stringify({ action, ...payload }) : undefined,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Le laboratoire n'a pas répondu.");
    return result;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur de chargement."); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: string, payload: Record<string,unknown> = {}) => {
    setBusy(key); setError(""); setNotice("");
    try { const result = await api(action, payload); setNotice("Opération enregistrée."); await refresh(); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Opération impossible."); }
    finally { setBusy(""); }
  };

  const approvedDatasets = useMemo(() => data.datasets.filter((item) => item.status === "approved"), [data.datasets]);
  const activeRelease = data.releases.find((item) => item.status === "active");
  const pendingReleases = data.releases.filter((item) => item.status === "awaiting_approval");

  const importExamples = async () => {
    if (!datasetId) return setError("Sélectionne un dataset.");
    try {
      const rows = examples.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
      await run("import", "import_examples", { dataset_id: datasetId, examples: rows });
      setExamples("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "JSONL invalide."); }
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_400_000) return setError("Fichier trop volumineux. Maximum 1,4 Mo.");
    setExamples(await file.text());
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-red-700"><BrainCircuit className="size-4"/> DEBS AI Studio</div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Laboratoire IA</h1>
          <p className="mt-1 text-sm text-slate-500">Datasets, apprentissage supervisé, mémoire et versions du modèle.</p>
        </div>
        <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`}/> Actualiser</button>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><CircleAlert className="mt-0.5 size-4 shrink-0"/><span>{error}</span></div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {error.includes("administrateurs") && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Autorisation administrateur requise.</strong>
        <p className="mt-1">Dans Supabase Auth, ajoute la valeur <code>debs_role: admin</code> aux <code>app_metadata</code> du compte propriétaire. Ne la place jamais dans les métadonnées modifiables par l'utilisateur.</p>
      </div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label:"Datasets", value:data.datasets.length, icon:Database },
          { label:"Travaux d'entraînement", value:data.jobs.length, icon:FlaskConical },
          { label:"Versions candidates", value:pendingReleases.length, icon:Rocket },
          { label:"Documents mémoire", value:data.knowledge.length, icon:FileJson },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{item.label}</span><item.icon className="size-4 text-red-600"/></div><div className="mt-2 text-2xl font-bold text-slate-950">{item.value}</div></div>)}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {([["overview","Vue d'ensemble"],["datasets","Datasets"],["training","Entraînement"],["models","Registre modèles"],["memory","Mémoire"]] as const).map(([key,label]) =>
          <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm ${tab===key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{label}</button>
        )}
      </nav>

      {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="size-5 animate-spin"/> Chargement du laboratoire…</div> : <>
        {tab === "overview" && <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">État du modèle</h2>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Version active</div>
              <div className="mt-1 text-xl font-bold">{activeRelease?.version ?? "Aucune version DEBS active"}</div>
              <div className="mt-2 text-xs text-slate-500">{activeRelease?.base_model ?? "Le runtime utilise encore son modèle bootstrap."}</div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Une version candidate ne devient active qu'après évaluation et approbation humaine. Une version approuvée n'est pas encore déployée sur le serveur d'inférence. Le déploiement sera une étape séparée.</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Derniers travaux</h2>
            <div className="mt-3 space-y-2">{data.jobs.slice(0,5).map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{job.base_model}</div><div className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString("fr-FR")}</div></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{statusLabel[job.status] ?? job.status}</span></div>)}
              {!data.jobs.length && <p className="text-sm text-slate-500">Aucun entraînement demandé.</p>}</div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-emerald-600"/> Garde-fous actifs</div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><p>• Consentement et revue des données obligatoires.</p><p>• Partition train, validation et test exigée.</p><p>• Pas d'entraînement automatique sur les conversations.</p><p>• Publication d'un modèle soumise à validation humaine.</p><p>• Clés GPU et Supabase conservées côté serveur.</p><p>• Aucun fournisseur externe comme solution de secours.</p></div>
          </section>
        </div>}

        {tab === "datasets" && <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Créer un dataset</h2>
            <div className="mt-4 space-y-3">
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Nom du dataset" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/>
              <textarea value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Description et objectif" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/>
              <textarea value={consent} onChange={(e)=>setConsent(e.target.value)} placeholder="Provenance, droits et base d'autorisation des données" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/>
              <button disabled={!!busy} onClick={()=>void run("dataset","create_dataset",{name,description,consent_basis:consent})} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="size-4"/> Créer le dataset</button>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Importer des exemples JSONL</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Chaque ligne doit être un objet JSON avec input, target, split, pii_reviewed:true et consent_confirmed:true. Répartition obligatoire : train, validation, test.</p>
            <select value={datasetId} onChange={(e)=>setDatasetId(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choisir un dataset</option>{data.datasets.filter((d)=>d.status!=="approved"&&d.status!=="archived").map((d)=><option key={d.id} value={d.id}>{d.name} · {statusLabel[d.status]}</option>)}</select>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600 hover:bg-slate-50"><Upload className="size-4"/> Charger un fichier JSONL<input type="file" accept=".jsonl,.json,.txt" className="hidden" onChange={(e)=>void loadFile(e.target.files?.[0])}/></label>
            <textarea value={examples} onChange={(e)=>setExamples(e.target.value)} rows={8} placeholder={'{"input":"Bonjour","target":"Bonjour, comment puis-je aider ?","split":"train","pii_reviewed":true,"consent_confirmed":true}\n{"input":"Explique une boucle","target":"Une boucle répète des instructions.","split":"validation","pii_reviewed":true,"consent_confirmed":true}\n{"input":"2 + 2 ?","target":"4","split":"test","pii_reviewed":true,"consent_confirmed":true}'} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs"/>
            <button disabled={!!busy||!datasetId||!examples.trim()} onClick={()=>void importExamples()} className="mt-3 w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy==="import"?"Import…":"Importer les exemples"}</button>
            <p className="mt-2 text-[11px] leading-4 text-amber-700">N'importe que des données que tu possèdes ou es autorisé à utiliser. Vérifie l'absence de données personnelles et secrets avant import.</p>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">Datasets existants</h2>
            <div className="mt-3 divide-y divide-slate-100">{data.datasets.map((d)=><div key={d.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-medium text-slate-900">{d.name}</div><div className="text-xs text-slate-500">{d.item_count} exemples · {statusLabel[d.status] ?? d.status}</div></div><div className="flex flex-wrap gap-2">{d.status!=="approved"&&d.status!=="archived"&&<button disabled={!!busy} onClick={()=>void run("approve-"+d.id,"approve_dataset",{dataset_id:d.id})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Valider les données</button>}{d.status==="approved"&&<button onClick={()=>{setDatasetId(d.id);setTab("training")}} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white">Préparer entraînement</button>}</div></div>)}
              {!data.datasets.length&&<p className="py-5 text-sm text-slate-500">Aucun dataset.</p>}</div>
          </section>
        </div>}

        {tab === "training" && <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Lancer un entraînement</h2>
            <p className="mt-1 text-xs text-slate-500">Le travail sera placé dans la file. Il attend un worker GPU privé connecté au projet.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-slate-600">Dataset<select value={datasetId} onChange={(e)=>setDatasetId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Choisir</option>{approvedDatasets.map((d)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="text-xs font-medium text-slate-600">Modèle de base<select className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value="Qwen/Qwen2.5-3B-Instruct" disabled><option>Qwen/Qwen2.5-3B-Instruct</option></select></label>
              <label className="text-xs font-medium text-slate-600">Méthode<select value={trainingMethod} onChange={(e)=>setTrainingMethod(e.target.value as "lora"|"qlora")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="qlora">QLoRA 4-bit</option><option value="lora">LoRA</option></select></label>
            </div>
            <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={modelLicenseReviewed} onChange={(e)=>setModelLicenseReviewed(e.target.checked)} className="mt-1"/> J'ai vérifié la licence et les conditions d'utilisation du modèle de base avant l'entraînement.</label>
            <button disabled={!!busy||!modelLicenseReviewed||!datasetId||!approvedDatasets.some((d)=>d.id===datasetId)} onClick={()=>void run("queue","queue_training",{dataset_id:datasetId,base_model:"Qwen/Qwen2.5-3B-Instruct",training_method:trainingMethod,epochs:1,model_license_reviewed:true})} className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy==="queue"?"Mise en file…":"Mettre en file l'entraînement"}</button>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">File d'entraînement</h2><div className="mt-3 space-y-2">{data.jobs.map((job)=><div key={job.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{job.base_model}</strong><span className="rounded-full bg-white px-2 py-1 text-xs">{statusLabel[job.status]??job.status}</span></div><div className="mt-1 text-xs text-slate-500">ID {job.id} · {job.training_method} · {new Date(job.created_at).toLocaleString("fr-FR")}</div>{job.error_message&&<p className="mt-2 text-xs text-red-700">{job.error_message}</p>}</div>)}{!data.jobs.length&&<p className="text-sm text-slate-500">Aucun travail dans la file.</p>}</div></section>
        </div>}

        {tab === "models" && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Registre des modèles</h2>
          <div className="mt-3 space-y-3">{data.releases.map((release)=><div key={release.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{release.version}</div><div className="text-xs text-slate-500">{release.base_model} · {statusLabel[release.status]??release.status}</div></div>{release.status==="awaiting_approval"&&<div className="flex gap-2"><button disabled={!!busy} onClick={()=>void run("approve-"+release.id,"approve_release",{release_id:release.id})} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Approuver</button><button disabled={!!busy} onClick={()=>void run("reject-"+release.id,"reject_release",{release_id:release.id})} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Refuser</button></div>}</div><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">{JSON.stringify(release.metrics??{},null,2)}</pre></div>)}{!data.releases.length&&<p className="text-sm text-slate-500">Aucune version entraînée n'a encore été publiée.</p>}</div>
        </section>}

        {tab === "memory" && <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Ajouter une connaissance</h2><p className="mt-1 text-xs text-slate-500">Les documents restent privés tant que tu ne les publies pas. Les sources et droits doivent être renseignés.</p><div className="mt-4 space-y-3"><input value={knowledgeTitle} onChange={(e)=>setKnowledgeTitle(e.target.value)} placeholder="Titre" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><textarea value={knowledgeContent} onChange={(e)=>setKnowledgeContent(e.target.value)} rows={6} placeholder="Contenu documentaire" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><input value={sourceReference} onChange={(e)=>setSourceReference(e.target.value)} placeholder="Source ou URL" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><textarea value={knowledgeConsent} onChange={(e)=>setKnowledgeConsent(e.target.value)} rows={2} placeholder="Licence, provenance et autorisation" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><button disabled={!!busy} onClick={()=>void run("knowledge","create_knowledge",{title:knowledgeTitle,content:knowledgeContent,source_reference:sourceReference,consent_basis:knowledgeConsent})} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Enregistrer le document</button></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Base de connaissances</h2><div className="mt-3 space-y-2">{data.knowledge.map((doc)=><div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><div className="truncate text-sm font-semibold">{doc.title}</div><div className="text-xs text-slate-500">{doc.is_published?"Publié":"Brouillon"} {doc.source_reference&&"· "+doc.source_reference}</div></div>{!doc.is_published&&<button disabled={!!busy} onClick={()=>void run("publish-"+doc.id,"publish_knowledge",{document_id:doc.id})} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Publier</button>}</div>)}{!data.knowledge.length&&<p className="text-sm text-slate-500">Aucun document.</p>}</div></section>
        </div>}
      </>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">Le laboratoire est une interface d'administration. Les entraînements réels nécessitent le worker GPU privé et les secrets serveur. Les conversations ne sont jamais ajoutées automatiquement aux datasets.</div>
    </div>
  );
}
