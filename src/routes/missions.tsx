import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Clock3, Pause, Play, Plus, RefreshCw, Square, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ReviewPlan = { summary?: string; steps?: Array<{ title: string; description: string; files?: string[] }> };
type ReviewProposal = { plan?: ReviewPlan | null; summary?: string; diff?: string; files_summary?: Array<{ path: string; lines: number; bytes: number }> };
type Mission = {
 id: string; title: string; goal: string; status: string; requested_hours: number; checkpoint?: { review_proposal?: ReviewProposal };
 deadline_at: string; heartbeat_at: string | null; last_summary: string | null;
 step_count: number; max_steps: number; created_at: string;
};
type MissionEvent = { id: number; event_type: string; message: string; metadata?: { annotations?: Array<{ check: string; path: string; line: number | null; level: string; message: string }>; github_proposal?: { url?: string; number?: number; branch?: string; checks?: { state?: string; failed_checks?: string[]; checks?: Array<{ name: string; status: string; conclusion: string | null; details_url: string | null; output_title?: string | null; output_summary?: string | null }> } } }; created_at: string };
const statusLabels: Record<string,string> = { queued:"En attente", running:"En cours", paused:"En pause", awaiting_review:"Diff à valider", review_rejected:"Proposition refusée", completed:"Terminée", failed:"Échec", cancelled:"Annulée", expired:"Durée écoulée" };
const statusStyles: Record<string,string> = { queued:"bg-slate-100 text-slate-700", running:"bg-blue-100 text-blue-700", paused:"bg-amber-100 text-amber-700", awaiting_review:"bg-violet-100 text-violet-700", review_rejected:"bg-slate-100 text-slate-500", completed:"bg-emerald-100 text-emerald-700", failed:"bg-red-100 text-red-700", cancelled:"bg-slate-100 text-slate-500", expired:"bg-orange-100 text-orange-700" };

function MissionsPage() {
 const [missions,setMissions]=useState<Mission[]>([]);
 const [events,setEvents]=useState<Record<string,MissionEvent[]>>({});
 const [goal,setGoal]=useState("");
 const [title,setTitle]=useState("");
 const [hours,setHours]=useState(24);
 const [maxSteps,setMaxSteps]=useState(100);
 const [loading,setLoading]=useState(true);
 const [creating,setCreating]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const [signedIn,setSignedIn]=useState(false);

 const load=useCallback(async()=>{
  const {data:auth}=await supabase.auth.getUser();
  setSignedIn(Boolean(auth.user));
  if(!auth.user){setMissions([]);setLoading(false);return;}
  const {data,error}=await supabase.from("agent_work_sessions").select("*").order("created_at",{ascending:false}).limit(30);
  if(error){setNotice("Impossible de charger les missions. Vérifie que la migration SQL est appliquée.");setLoading(false);return;}
  const rows=(data??[]) as Mission[];setMissions(rows);
  const next:Record<string,MissionEvent[]>={};
  await Promise.all(rows.slice(0,10).map(async mission=>{
   const {data:items}=await supabase.from("agent_work_events").select("id,event_type,message,metadata,created_at").eq("session_id",mission.id).order("created_at",{ascending:false}).limit(5);
   next[mission.id]=(items??[]) as MissionEvent[];
  }));
  setEvents(next);setLoading(false);
 },[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),20000);return()=>window.clearInterval(timer);},[load]);

 const create=async()=>{
  if(goal.trim().length<8)return;
  setCreating(true);setNotice("");
  const {data,error}=await supabase.functions.invoke("agent-work",{body:{action:"create",title:title.trim()||undefined,goal:goal.trim(),hours,max_steps:maxSteps}});
  if(error||!data?.ok){setNotice(data?.error??error?.message??"La création de mission a échoué. Vérifie le déploiement de la fonction agent-work.");}
  else{setGoal("");setTitle("");setNotice("Mission créée. Elle commencera lorsque le worker planifié sera activé.");await load();}
  setCreating(false);
 };
 const command=async(id:string,action:"pause"|"resume"|"cancel"|"approve_changes"|"reject_changes")=>{
  setBusy(id);setNotice("");
  const {data,error}=await supabase.functions.invoke("agent-work",{body:{action,session_id:id}});
  if(error||!data?.ok)setNotice(data?.error??error?.message??"Action impossible.");
  else {setNotice(action==="approve_changes"?"Diff validé : le Pull Request brouillon a été créé.":action==="reject_changes"?"Proposition refusée. Aucun changement n’a été envoyé à GitHub.":"");await load();}
  setBusy(null);
 };
 const formatDate=(value:string)=>new Date(value).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"});
 const activeCount=missions.filter(m=>m.status==="queued"||m.status==="running"||m.status==="paused").length;

 return <div className="mx-auto w-full max-w-4xl space-y-6">
  <header className="space-y-2">
   <div className="flex items-center gap-2 text-sm font-semibold text-blue-600"><Activity className="size-4"/> Agent autonome</div>
   <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Missions longue durée</h1>
   <p className="max-w-2xl text-sm leading-6 text-slate-600">Lance un objectif que DEBS AI découpera en étapes sauvegardées. Tu peux fermer cette page et revenir plus tard : l'exécution dépendra du worker et du planificateur serveur.</p>
   <div className="flex flex-wrap gap-2 text-xs text-slate-600">
    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5">{activeCount} mission(s) active(s)</span>
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">Jusqu'à 7 jours par mission</span>
   </div>
  </header>

  <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
   <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Plus className="size-4 text-blue-600"/> Nouvelle mission</h2>
   <div className="mt-4 space-y-3">
    <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre (facultatif)" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"/>
    <textarea value={goal} onChange={e=>setGoal(e.target.value)} rows={4} placeholder="Décris précisément le travail à effectuer, le résultat attendu et les contraintes…" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"/>
    <div className="flex flex-wrap items-center justify-between gap-3">
     <label className="flex items-center gap-2 text-sm text-slate-600"><Timer className="size-4"/> Durée
      <select value={hours} onChange={e=>setHours(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800">
       <option value={1}>1 heure</option><option value={10}>10 heures</option><option value={24}>24 heures</option><option value={48}>48 heures</option><option value={72}>3 jours</option><option value={168}>7 jours</option>
      </select>
     </label>
     <label className="flex items-center gap-2 text-sm text-slate-600">Étapes max.
      <select value={maxSteps} onChange={e=>setMaxSteps(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800">
       <option value={100}>100</option><option value={500}>500</option><option value={1000}>1 000</option><option value={1500}>1 500</option><option value={2000}>2 000</option>
      </select>
     </label>
     <button onClick={create} disabled={!signedIn||creating||goal.trim().length<8} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40">{creating?"Création…":"Créer la mission"}</button>
    </div>
   </div>
   {!signedIn&&<p className="mt-3 text-xs text-amber-700">Connecte-toi pour créer et suivre tes missions.</p>}
  </section>

  {notice&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}
  <section className="space-y-3">
   <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Historique des missions</h2><button onClick={()=>void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"><RefreshCw className="size-3.5"/> Actualiser</button></div>
   {loading?<p className="py-8 text-center text-sm text-slate-500">Chargement…</p>:missions.length===0?<div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">Aucune mission pour le moment.</div>:missions.map(mission=><article key={mission.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{mission.title}</h3><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{mission.goal}</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold "+(statusStyles[mission.status]??statusStyles.queued)}>{statusLabels[mission.status]??mission.status}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-3"><span><Activity className="mr-1 inline size-3.5"/>Étapes : {mission.step_count}/{mission.max_steps}</span><span><Clock3 className="mr-1 inline size-3.5"/>Échéance : {formatDate(mission.deadline_at)}</span><span>Durée : {mission.requested_hours} h</span></div>
    {mission.last_summary&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{mission.last_summary}</p>}
    {mission.status==="awaiting_review"&&mission.checkpoint?.review_proposal&&<section className="mt-4 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 sm:p-4">
     <div><p className="text-sm font-semibold text-violet-900">Validation requise avant création du PR</p><p className="mt-1 text-xs text-violet-800">Aucun commit ni Pull Request n’a encore été créé. Vérifie le plan et le diff avant de continuer.</p></div>
     {mission.checkpoint.review_proposal.plan&&<div className="rounded-xl border border-violet-100 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Plan proposé</p><p className="mt-1 text-sm text-slate-800">{mission.checkpoint.review_proposal.plan.summary}</p><ol className="mt-2 list-decimal space-y-2 pl-5 text-xs text-slate-600">{mission.checkpoint.review_proposal.plan.steps?.map((step,index)=><li key={index}><span className="font-semibold text-slate-800">{step.title}</span><p>{step.description}</p>{step.files?.length>0&&<p className="mt-1 font-mono text-[11px]">{step.files.join(" · ")}</p>}</li>)}</ol></div>}
     <div className="rounded-xl border border-violet-100 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Fichiers modifiés</p><ul className="mt-2 space-y-1 text-xs text-slate-700">{mission.checkpoint.review_proposal.files_summary?.map(file=><li key={file.path} className="flex flex-wrap justify-between gap-2"><span className="font-mono">{file.path}</span><span className="text-slate-500">{file.lines} lignes · {file.bytes} octets</span></li>)}</ul></div>
     <details className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-100">Afficher le diff complet (aperçu borné)</summary><pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-slate-100">{mission.checkpoint.review_proposal.diff??"Aucun diff disponible."}</pre></details>
     <div className="flex flex-wrap gap-2"><button disabled={busy===mission.id} onClick={()=>void command(mission.id,"approve_changes")} className="rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy===mission.id?"Traitement…":"Valider et créer le PR"}</button><button disabled={busy===mission.id} onClick={()=>void command(mission.id,"reject_changes")} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-700 disabled:opacity-50">Refuser la proposition</button></div>
    </section>}
    <div className="mt-3 flex flex-wrap gap-2">
     {(mission.status==="queued"||mission.status==="running")&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"pause")} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700"><Pause className="size-3.5"/>Pause</button>}
     {mission.status==="paused"&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"resume")} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"><Play className="size-3.5"/>Reprendre</button>}
     {["queued","running","paused"].includes(mission.status)&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"cancel")} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"><Square className="size-3"/>Annuler</button>}
    </div>
    {events[mission.id]?.length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Journal récent ({events[mission.id].length})</summary><ol className="mt-2 space-y-2 border-l border-blue-100 pl-3">{events[mission.id].map(event=><li key={event.id} className="text-xs text-slate-600"><span className="font-semibold">{formatDate(event.created_at)}</span> — {event.message}{event.metadata?.github_proposal?.url&&<a href={event.metadata.github_proposal.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex font-semibold text-blue-700 underline">Voir le PR #{event.metadata.github_proposal.number??""}</a>}{event.metadata?.github_proposal?.checks&&<div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="font-semibold text-slate-700">Vérifications CI : {event.metadata.github_proposal.checks.state==="success"?"Réussies":event.metadata.github_proposal.checks.state==="failure"?"Échec":event.metadata.github_proposal.checks.state==="pending"?"En attente":"État inconnu"}</p>{event.metadata.github_proposal.checks.checks?.map((check,index)=><div key={check.name+index} className="mt-1"><p>{check.name} — {check.status==="completed"?(check.conclusion??"terminé"):"en cours"}</p>{check.output_title&&<p className="font-medium text-red-700">{check.output_title}</p>}{check.output_summary&&<p className="mt-1 whitespace-pre-wrap text-slate-500">{check.output_summary}</p>}{check.details_url&&<a href={check.details_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">Détails du contrôle</a>}</div>)}</div>}{event.metadata?.annotations&&event.metadata.annotations.length>0&&<div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2"><p className="font-semibold text-red-800">Diagnostics CI ({event.metadata.annotations.length})</p>{event.metadata.annotations.slice(0,12).map((annotation,index)=><div key={annotation.check+annotation.path+index} className="mt-1"><p className="font-medium text-slate-700">{annotation.path}{annotation.line?":"+annotation.line:""} — {annotation.check}</p><p className="whitespace-pre-wrap text-slate-600">{annotation.message}</p></div>)}</div>}</li>)}</ol></details>}
   </article>)}
  </section>
  <p className="text-xs leading-5 text-slate-400">Important : cette interface ne lance pas un processus 24 h dans le navigateur. La migration Supabase, la fonction Edge et un planificateur serveur doivent être déployés et configurés pour que les étapes s'enchaînent automatiquement.</p>
 </div>;
}
export const Route=createFileRoute("/missions")({component:MissionsPage});
