import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Clock3, Pause, Play, Plus, RefreshCw, Square, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Mission = {
 id: string; title: string; goal: string; status: string; requested_hours: number;
 deadline_at: string; heartbeat_at: string | null; last_summary: string | null;
 step_count: number; max_steps: number; created_at: string;
};
type MissionEvent = { id: number; event_type: string; message: string; created_at: string };
const statusLabels: Record<string,string> = { queued:"En attente", running:"En cours", paused:"En pause", completed:"Terminée", failed:"Échec", cancelled:"Annulée", expired:"Durée écoulée" };
const statusStyles: Record<string,string> = { queued:"bg-slate-100 text-slate-700", running:"bg-blue-100 text-blue-700", paused:"bg-amber-100 text-amber-700", completed:"bg-emerald-100 text-emerald-700", failed:"bg-red-100 text-red-700", cancelled:"bg-slate-100 text-slate-500", expired:"bg-orange-100 text-orange-700" };

function MissionsPage() {
 const [missions,setMissions]=useState<Mission[]>([]);
 const [events,setEvents]=useState<Record<string,MissionEvent[]>>({});
 const [goal,setGoal]=useState("");
 const [title,setTitle]=useState("");
 const [hours,setHours]=useState(24);
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
   const {data:items}=await supabase.from("agent_work_events").select("id,event_type,message,created_at").eq("session_id",mission.id).order("created_at",{ascending:false}).limit(5);
   next[mission.id]=(items??[]) as MissionEvent[];
  }));
  setEvents(next);setLoading(false);
 },[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),20000);return()=>window.clearInterval(timer);},[load]);

 const create=async()=>{
  if(goal.trim().length<8)return;
  setCreating(true);setNotice("");
  const {data,error}=await supabase.functions.invoke("agent-work",{body:{action:"create",title:title.trim()||undefined,goal:goal.trim(),hours,max_steps:100}});
  if(error||!data?.ok){setNotice(data?.error??error?.message??"La création de mission a échoué. Vérifie le déploiement de la fonction agent-work.");}
  else{setGoal("");setTitle("");setNotice("Mission créée. Elle commencera lorsque le worker planifié sera activé.");await load();}
  setCreating(false);
 };
 const command=async(id:string,action:"pause"|"resume"|"cancel")=>{
  setBusy(id);setNotice("");
  const {data,error}=await supabase.functions.invoke("agent-work",{body:{action,session_id:id}});
  if(error||!data?.ok)setNotice(data?.error??error?.message??"Action impossible.");
  else await load();
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
    <div className="mt-3 flex flex-wrap gap-2">
     {(mission.status==="queued"||mission.status==="running")&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"pause")} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700"><Pause className="size-3.5"/>Pause</button>}
     {mission.status==="paused"&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"resume")} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700"><Play className="size-3.5"/>Reprendre</button>}
     {["queued","running","paused"].includes(mission.status)&&<button disabled={busy===mission.id} onClick={()=>void command(mission.id,"cancel")} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"><Square className="size-3"/>Annuler</button>}
    </div>
    {events[mission.id]?.length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-500">Journal récent ({events[mission.id].length})</summary><ol className="mt-2 space-y-2 border-l border-blue-100 pl-3">{events[mission.id].map(event=><li key={event.id} className="text-xs text-slate-600"><span className="font-semibold">{formatDate(event.created_at)}</span> — {event.message}</li>)}</ol></details>}
   </article>)}
  </section>
  <p className="text-xs leading-5 text-slate-400">Important : cette interface ne lance pas un processus 24 h dans le navigateur. La migration Supabase, la fonction Edge et un planificateur serveur doivent être déployés et configurés pour que les étapes s'enchaînent automatiquement.</p>
 </div>;
}
export const Route=createFileRoute("/missions")({component:MissionsPage});
