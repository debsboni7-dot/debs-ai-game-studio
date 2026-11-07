import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-agent-worker-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(key:string)=>Deno.env.get(key)?.trim()??"";
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(request.method!=="POST")return json({error:"Méthode non autorisée."},405);
 const url=env("SUPABASE_URL"),serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!serviceKey)return json({error:"Configuration Supabase serveur incomplète."},503);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:Record<string,unknown>;try{body=await request.json();}catch{return json({error:"JSON invalide."},400);}
 const action=typeof body.action==="string"?body.action:"";
 if(action==="worker"){
  const secret=env("AGENT_WORKER_SECRET");
  if(!secret||request.headers.get("x-agent-worker-secret")!==secret)return json({error:"Worker non autorisé."},401);
  if(!env("LOVABLE_API_KEY"))return json({error:"LOVABLE_API_KEY absent."},503);
  const {data:claimed,error:claimError}=await admin.rpc("claim_agent_work_task",{p_lease_seconds:180});
  if(claimError)return json({error:"Réservation de tâche impossible.",detail:claimError.message},500);
  const task=Array.isArray(claimed)?claimed[0]:claimed;if(!task)return json({ok:true,claimed:false});
  const {data:session,error:sessionError}=await admin.from("agent_work_sessions").select("*").eq("id",task.session_id).single();
  if(sessionError||!session)return json({error:"Mission introuvable."},500);
  try{
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),95000);
   const prompt=[
    "Tu es le worker autonome de DEBS AI. Avance une mission en une seule étape courte, vérifiable et récupérable.",
    "Ne prétends jamais avoir modifié un dépôt, exécuté un test ou appelé un outil externe sans l'avoir réellement fait.",
    "Réponds uniquement avec un JSON valide : { \"done\": boolean, \"summary\": string, \"checkpoint\": object, \"next_action\": string }.",
    "Si une action externe n'est pas disponible, dis-le et propose une prochaine étape réaliste.",
    "Objectif : "+session.goal,"Checkpoint : "+JSON.stringify(session.checkpoint??{}),
    "Résultat précédent : "+JSON.stringify(task.input??{}),"Étape : "+(Number(session.step_count??0)+1)+" / "+session.max_steps,
    "Échéance : "+session.deadline_at
   ].join("\n\n");
   const response=await fetch("https://ai.gateway.lovable.dev/v1/responses",{method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+env("LOVABLE_API_KEY"),"Content-Type":"application/json"},
    body:JSON.stringify({model:"openai/gpt-6-astra",instructions:"Réponds en français, JSON strict, sans markdown. Une étape utile et honnête.",input:[{role:"user",content:[{type:"input_text",text:prompt}]}],max_output_tokens:1800,store:false})});
   clearTimeout(timeout);if(!response.ok)throw new Error("Passerelle IA HTTP "+response.status+".");
   const payload=await response.json();const outputText=typeof payload.output_text==="string"?payload.output_text:
    (payload.output??[]).flatMap((item:{content?:Array<{text?:string}>})=>item.content??[]).map((part:{text?:string})=>part.text??"").join("\n");
   if(!outputText.trim())throw new Error("Réponse vide du modèle.");
   let parsed:{done?:boolean;summary?:string;checkpoint?:Record<string,unknown>;next_action?:string};
   try{parsed=JSON.parse(outputText);}catch{parsed={done:false,summary:outputText.slice(0,4000),checkpoint:{raw:outputText.slice(0,12000)},next_action:"Reprendre depuis ce résultat."};}
   const now=new Date().toISOString(),steps=Number(session.step_count??0)+1,expired=Date.now()>=new Date(session.deadline_at).getTime();
   const completed=parsed.done===true||expired||steps>=Number(session.max_steps),summary=String(parsed.summary??"Étape terminée.").slice(0,4000);
   const checkpoint=parsed.checkpoint&&typeof parsed.checkpoint==="object"?parsed.checkpoint:{previous:session.checkpoint,latest:summary};
   const {error:taskError}=await admin.from("agent_work_tasks").update({status:"completed",result:{summary,checkpoint,next_action:parsed.next_action??""},lease_until:null,updated_at:now}).eq("id",task.id);
   if(taskError)throw taskError;
   const {error:updateError}=await admin.from("agent_work_sessions").update({status:completed?(expired?"expired":"completed"):"queued",checkpoint,last_summary:summary,step_count:steps,heartbeat_at:now,next_run_at:now,updated_at:now}).eq("id",session.id);
   if(updateError)throw updateError;
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:completed?"mission_completed":"step_completed",message:summary,metadata:{step_count:steps,next_action:parsed.next_action??""}});
   if(!completed){const {error}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{previous_summary:summary,next_action:parsed.next_action??""}});if(error)throw error;}
   return json({ok:true,claimed:true,completed,session_id:session.id,step_count:steps,summary});
  }catch(error){
   const message=error instanceof Error?error.message:"Erreur worker inconnue.",retry=Number(task.attempt??1)<Number(task.max_attempts??4);
   await admin.from("agent_work_tasks").update({status:retry?"queued":"failed",available_at:new Date(Date.now()+Math.min(300000,5000*2**Number(task.attempt??1))).toISOString(),lease_until:null,last_error:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",task.id);
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"step_retry",message:retry?"Étape interrompue ; nouvelle tentative programmée.":"Étape échouée après plusieurs tentatives.",metadata:{error:message.slice(0,500),attempt:task.attempt}});
   return json({ok:false,retry_scheduled:retry,session_id:session.id},retry?202:500);
  }
 }
 const auth=request.headers.get("Authorization")??"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token)return json({error:"Connexion requise."},401);
 const userClient=createClient(url,env("SUPABASE_ANON_KEY")||serviceKey,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false}});
 const {data:userData,error:userError}=await userClient.auth.getUser(token);
 if(userError||!userData.user)return json({error:"Session utilisateur invalide."},401);
 const userId=userData.user.id;
 if(action==="create"){
  const goal=typeof body.goal==="string"?body.goal.trim():"",hours=Number(body.hours??1),maxSteps=Number(body.max_steps??100);
  if(goal.length<8||goal.length>12000)return json({error:"Objectif : 8 à 12 000 caractères."},400);
  if(!Number.isInteger(hours)||hours<1||hours>168)return json({error:"Durée : 1 à 168 heures."},400);
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>1000)return json({error:"Nombre d'étapes invalide."},400);
  const title=(typeof body.title==="string"&&body.title.trim()?body.title.trim():goal.slice(0,80)).slice(0,120);
  const {data:session,error}=await userClient.from("agent_work_sessions").insert({user_id:userId,title,goal,requested_hours:hours,deadline_at:new Date(Date.now()+hours*3600000).toISOString(),max_steps:maxSteps,status:"queued"}).select("id,title,status,requested_hours,deadline_at,step_count,max_steps,created_at").single();
  if(error||!session)return json({error:"Création impossible.",detail:error?.message},500);
  const {error:taskError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{initial:true}});
  if(taskError){await admin.from("agent_work_sessions").delete().eq("id",session.id);return json({error:"Insertion dans la file impossible."},500);}
  await admin.from("agent_work_events").insert({session_id:session.id,event_type:"mission_created",message:"Mission créée et placée dans la file.",metadata:{hours,max_steps:maxSteps}});
  return json({ok:true,session});
 }
 const id=typeof body.session_id==="string"?body.session_id:"";if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Identifiant invalide."},400);
 const {data:session,error:readError}=await userClient.from("agent_work_sessions").select("*").eq("id",id).eq("user_id",userId).single();
 if(readError||!session)return json({error:"Mission introuvable."},404);
 if(action==="status"){
  const [{data:events},{data:tasks}]=await Promise.all([
   userClient.from("agent_work_events").select("id,event_type,message,metadata,created_at").eq("session_id",id).order("created_at",{ascending:true}).limit(100),
   userClient.from("agent_work_tasks").select("id,status,attempt,available_at,last_error,created_at,updated_at").eq("session_id",id).order("created_at",{ascending:true}).limit(100)]);
  return json({ok:true,session,events:events??[],tasks:tasks??[]});
 }
 if(["pause","resume","cancel"].includes(action)){
  const status=action==="pause"?"paused":action==="resume"?"queued":"cancelled";
  if(action==="resume"&&new Date(session.deadline_at).getTime()<=Date.now())return json({error:"Durée de mission dépassée."},409);
  if(["completed","failed","cancelled","expired"].includes(session.status))return json({error:"Mission déjà terminée."},409);
  const {error}=await admin.from("agent_work_sessions").update({status,next_run_at:new Date().toISOString()}).eq("id",id).eq("user_id",userId);
  if(error)return json({error:"Modification impossible."},500);
  if(action==="cancel")await admin.from("agent_work_tasks").update({status:"cancelled",lease_until:null}).eq("session_id",id).in("status",["queued","running"]);
  if(action==="pause")await admin.from("agent_work_tasks").update({status:"queued",lease_until:null}).eq("session_id",id).eq("status","running");
  if(action==="resume"){
   const {count}=await admin.from("agent_work_tasks").select("id",{count:"exact",head:true}).eq("session_id",id).eq("status","queued");
   if(!count)await admin.from("agent_work_tasks").insert({session_id:id,status:"queued",task_type:"agent_step",input:{resume:true}});
  }
  await admin.from("agent_work_events").insert({session_id:id,event_type:"mission_"+action,message:action==="pause"?"Mission en pause.":action==="resume"?"Mission reprise.":"Mission annulée."});
  return json({ok:true,session_id:id,status});
 }
 return json({error:"Action inconnue."},400);
});
