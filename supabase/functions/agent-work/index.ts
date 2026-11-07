import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createMissionPullRequest, inspectPullRequestChecks, readCheckAnnotations, updateMissionPullRequestBranch, type ProposedFile } from "./github-executor.ts";
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
  await admin.from("agent_work_sessions").update({status:"expired",updated_at:new Date().toISOString()}).in("status",["queued","running"]).lt("deadline_at",new Date().toISOString());
  if(!env("LOVABLE_API_KEY"))return json({error:"LOVABLE_API_KEY absent."},503);
  const {data:claimed,error:claimError}=await admin.rpc("claim_agent_work_task",{p_lease_seconds:180});
  if(claimError)return json({error:"Réservation de tâche impossible.",detail:claimError.message},500);
  const task=Array.isArray(claimed)?claimed[0]:claimed;if(!task)return json({ok:true,claimed:false});
  const {data:session,error:sessionError}=await admin.from("agent_work_sessions").select("*").eq("id",task.session_id).single();
  if(sessionError||!session)return json({error:"Mission introuvable."},500);
  try{
   if(task.task_type==="github_ci_check"){
    const proposal=(task.input??{}) as {url?:string;number?:number;branch?:string;head_sha?:string;poll_count?:number};
    if(!proposal.head_sha)throw new Error("SHA du commit absent pour le suivi CI.");
    const checks=await inspectPullRequestChecks(proposal.head_sha,0);
    const {data:ciSession}=await admin.from("agent_work_sessions").select("status,checkpoint").eq("id",session.id).single();
    if(ciSession?.status==="paused"||ciSession?.status==="cancelled"||ciSession?.status==="expired"){
     await admin.from("agent_work_tasks").update({status:ciSession.status==="paused"?"queued":"cancelled",lease_until:null,updated_at:new Date().toISOString()}).eq("id",task.id);
     return json({ok:true,claimed:true,ci_paused:true,session_id:session.id});
    }
    const pollCount=Number(proposal.poll_count??0)+1;
    const eventMetadata={github_proposal:{...proposal,checks}};
    if(checks.state==="pending"&&pollCount<120){
     const nextAt=new Date(Date.now()+60000).toISOString();
     const {error:taskUpdateError}=await admin.from("agent_work_tasks").update({status:"completed",result:{checks},lease_until:null,updated_at:new Date().toISOString()}).eq("id",task.id);
     if(taskUpdateError)throw taskUpdateError;
     await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"github_ci_pending",message:"Les vérifications GitHub sont encore en cours ; nouveau contrôle programmé.",metadata:eventMetadata});
     const {error:nextError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_check",max_attempts:4,available_at:nextAt,input:{...proposal,poll_count:pollCount}});
     if(nextError)throw nextError;
     await admin.from("agent_work_sessions").update({status:"queued",checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},last_summary:"Pull Request créé ; vérifications CI en cours.",heartbeat_at:new Date().toISOString(),next_run_at:nextAt,updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
     return json({ok:true,claimed:true,ci_state:"pending",session_id:session.id,poll_count:pollCount});
    }
    const finalSummary=checks.state==="success"?"Les vérifications GitHub ont réussi.":"Les vérifications GitHub ont échoué : "+(checks.failed_checks.join(", ")||"résultat incomplet ou délai de suivi atteint.");
    await admin.from("agent_work_tasks").update({status:"completed",result:{checks},lease_until:null,updated_at:new Date().toISOString()}).eq("id",task.id);
    if(checks.state==="failure"&&Number(proposal.repair_count??0)<2){
     const annotations=await readCheckAnnotations(proposal.head_sha);
     const {error:repairError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_repair",max_attempts:2,input:{...proposal,repair_count:Number(proposal.repair_count??0)+1,checks,annotations}});
     if(repairError)throw repairError;
     await admin.from("agent_work_sessions").update({status:"queued",last_summary:"Échec CI détecté ; préparation d'une correction contrôlée.",checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},heartbeat_at:new Date().toISOString(),next_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
     await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"github_ci_repair_started",message:"Échec CI détecté ; l'agent prépare une correction (tentative "+(Number(proposal.repair_count??0)+1)+"/2).",metadata:{...eventMetadata,annotations}});
     return json({ok:true,claimed:true,ci_state:"failure",repair_scheduled:true,session_id:session.id});
    }
    const finalStatus=checks.state==="success"?"completed":"failed";
    await admin.from("agent_work_sessions").update({status:finalStatus,last_summary:finalSummary,checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},heartbeat_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
    await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:checks.state==="success"?"github_ci_passed":"github_ci_failed",message:finalSummary,metadata:eventMetadata});
    return json({ok:true,claimed:true,ci_state:checks.state,session_id:session.id});
   }
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),95000);
   const prompt=[
    "Tu es le worker autonome de DEBS AI. Avance une mission en une seule étape courte, vérifiable et récupérable.",
    "Ne prétends jamais avoir modifié un dépôt, exécuté un test ou appelé un outil externe sans l'avoir réellement fait.",
    "Réponds uniquement avec un JSON valide : { \"done\": boolean, \"summary\": string, \"checkpoint\": object, \"next_action\": string, \"files\": [{ \"path\": string, \"content\": string }] }.",
    "Étudie d'abord les extraits de fichiers fournis. Respecte les conventions et l'architecture existantes ; ne remplace pas un fichier entier sans nécessité. Si le contexte est insuffisant, explique-le et ne propose pas de code spéculatif.",
    "Pour une mission de programmation, prépare une seule proposition cohérente et finale dans files (maximum 12 fichiers), puis mets done=true. Une proposition de fichiers clôt cette mission et crée un unique PR brouillon. N’inclus aucun secret, aucun fichier .env et n’affirme jamais avoir exécuté des tests. Si aucun changement concret n'est prêt, files doit être [].",
    "Pour une tâche github_ci_repair, propose uniquement le correctif minimal des erreurs CI. Les fichiers seront commités sur la branche du PR existant ; ne crée pas une nouvelle branche et ne modifie jamais .github/workflows.",
    "Objectif : "+session.goal,"Checkpoint : "+JSON.stringify(session.checkpoint??{}),
    "Résultat précédent / diagnostics CI : "+JSON.stringify(task.input??{}),"TÂCHE DE RÉPARATION : "+(task.task_type==="github_ci_repair"?"Tu dois corriger uniquement les causes des contrôles CI échoués. Lis les fichiers de la branche du PR, corrige les erreurs indiquées par les annotations, ne touche pas aux workflows ni aux secrets, et ne fais pas de refonte sans rapport. Retourne uniquement les fichiers modifiés nécessaires.":"Mission normale."),"Étape : "+(Number(session.step_count??0)+1)+" / "+session.max_steps,
    "Dépôt GitHub autorisé : "+(env("GITHUB_REPOSITORY")||"non configuré")+" ; branche cible : "+(env("GITHUB_BASE_BRANCH")||"main"),
    "Contexte du dépôt GitHub (arborescence et extraits réels) : "+JSON.stringify(await (async()=>{try{
      const token=env("GITHUB_TOKEN"),repo=env("GITHUB_REPOSITORY"),branch=(task.task_type==="github_ci_repair"&&typeof task.input?.branch==="string"?task.input.branch:env("GITHUB_BASE_BRANCH")||"main");
      if(!token||!repo)return {files:[],contents:[]};
      const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
      const treeResponse=await fetch("https://api.github.com/repos/"+repo+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1",{headers});
      if(!treeResponse.ok)return {files:[],contents:[],warning:"Lecture de l'arborescence impossible (HTTP "+treeResponse.status+")."};
      const treeData=await treeResponse.json();
      const paths=(treeData.tree??[]).filter((x:{type:string;path:string;size?:number})=>x.type==="blob"&&
        !/(^|[/])(node_modules|dist|build|coverage|[.]git|[.]next|vendor)([/]|$)/i.test(x.path)&&
        !/(^|[/])([.]env[^/]*|secrets?[^/]*|id_rsa([.]pub)?|.*[.]lock)([/]|$)/i.test(x.path)&&
        /[.](tsx?|jsx?|json|md|toml|yaml|yml|sql|css)$/i.test(x.path)&&Number(x.size??0)<=30000);
      const ranked=paths.map((x:{path:string;size?:number})=>({path:x.path,size:x.size??0,score:
        (/^(README|package\.json|tsconfig|vite\.config|bun\.fig|deno\.json)/i.test(x.path.split("/").pop()??"")?5:0)+
        (/(src[/]|supabase[/]functions[/])/i.test(x.path)?3:0)+
        (/[.](tsx?|jsx?|sql)$/.test(x.path)?2:0)})).sort((a,b)=>b.score-a.score);
      const selected=ranked.slice(0,8);
      const contents=[];let total=0;
      for(const item of selected){
        if(total>=60000)break;
        try{
          const fileResponse=await fetch("https://api.github.com/repos/"+repo+"/contents/"+item.path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers});
          if(!fileResponse.ok)continue;
          const fileData=await fileResponse.json();
          if(fileData.type!=="file"||typeof fileData.content!=="string"||fileData.encoding!=="base64")continue;
          const binary=atob(fileData.content.replace(/\s/g,""));
          const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
          const text=new TextDecoder().decode(bytes).slice(0,Math.min(12000,60000-total));
          contents.push({path:item.path,content:text});total+=text.length;
        }catch{/* fichier ignoré : le contexte reste borné */}
      }
      return {branch,truncated:Boolean(treeData.truncated),files:ranked.slice(0,100).map(x=>x.path),contents};
    }catch{return {files:[],contents:[],warning:"Contexte GitHub indisponible."};}})()),
    "Échéance : "+session.deadline_at
   ].join("\n\n");
   const response=await fetch("https://ai.gateway.lovable.dev/v1/responses",{method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+env("LOVABLE_API_KEY"),"Content-Type":"application/json"},
    body:JSON.stringify({model:"openai/gpt-6-astra",instructions:"Réponds en français, JSON strict, sans markdown. Une étape utile et honnête.",input:[{role:"user",content:[{type:"input_text",text:prompt}]}],max_output_tokens:10000,store:false})});
   clearTimeout(timeout);if(!response.ok)throw new Error("Passerelle IA HTTP "+response.status+".");
   const payload=await response.json();const outputText=typeof payload.output_text==="string"?payload.output_text:
    (payload.output??[]).flatMap((item:{content?:Array<{text?:string}>})=>item.content??[]).map((part:{text?:string})=>part.text??"").join("\n");
   if(!outputText.trim())throw new Error("Réponse vide du modèle.");
   let parsed:{done?:boolean;summary?:string;checkpoint?:Record<string,unknown>;next_action?:string;files?:ProposedFile[]};
   try{parsed=JSON.parse(outputText);}catch{parsed={done:false,summary:outputText.slice(0,4000),checkpoint:{raw:outputText.slice(0,12000)},next_action:"Reprendre depuis ce résultat."};}
   const now=new Date().toISOString(),steps=Number(session.step_count??0)+1,expired=Date.now()>=new Date(session.deadline_at).getTime();
   const hasFiles=Array.isArray(parsed.files)&&parsed.files.length>0;
   if(task.task_type==="github_ci_repair"&&!hasFiles)throw new Error("Aucun correctif de code exploitable proposé après analyse des erreurs CI.");
   let completed=parsed.done===true||hasFiles||expired||steps>=Number(session.max_steps);let ciFailure=false;const summary=String(parsed.summary??"Étape terminée.").slice(0,4000);
   const checkpoint=parsed.checkpoint&&typeof parsed.checkpoint==="object"?parsed.checkpoint:{previous:session.checkpoint,latest:summary};
   let githubProposal:Record<string,unknown>|null=null;
   if(hasFiles){
    if(task.task_type==="github_ci_repair"){
     const repairInput=task.input as {branch?:string;url?:string;number?:number;repair_count?:number};
     if(!repairInput.branch)throw new Error("Branche du PR absente pour la correction.");
     const update=await updateMissionPullRequestBranch(repairInput.branch,parsed.files!,String(session.title??"Mission DEBS AI"));
     githubProposal={...repairInput,...update,url:repairInput.url,number:repairInput.number,repair_count:repairInput.repair_count};
    }else{
     githubProposal=await createMissionPullRequest(parsed.files!,String(session.title??"Mission DEBS AI"),summary);
    }
    const proposal=githubProposal as {url?:string;number?:number;branch?:string;head_sha?:string;checks?:{state?:string};repair_count?:number};
    if(proposal.checks?.state==="pending"||proposal.checks?.state==="failure"){
     completed=false;
     const {error:ciTaskError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_check",max_attempts:4,input:{url:proposal.url,number:proposal.number,branch:proposal.branch,head_sha:proposal.head_sha,poll_count:0,repair_count:proposal.repair_count??0}});
     if(ciTaskError)throw ciTaskError;
    }
   }
   const {error:taskError}=await admin.from("agent_work_tasks").update({status:"completed",result:{summary,checkpoint,next_action:parsed.next_action??""},lease_until:null,updated_at:now}).eq("id",task.id);
   if(taskError)throw taskError;
   const {data:latestSession}=await admin.from("agent_work_sessions").select("status").eq("id",session.id).single();
   if(latestSession?.status==="paused"){
    await admin.from("agent_work_tasks").update({status:"queued",lease_until:null,updated_at:now}).eq("id",task.id);
    return json({ok:true,claimed:true,paused:true,session_id:session.id});
   }
   if(latestSession?.status==="cancelled"||latestSession?.status==="expired"){
    await admin.from("agent_work_tasks").update({status:"cancelled",lease_until:null,updated_at:now}).eq("id",task.id);
    return json({ok:true,claimed:true,cancelled:true,session_id:session.id});
   }
   const {error:updateError}=await admin.from("agent_work_sessions").update({status:ciFailure?"failed":completed?(expired?"expired":"completed"):"queued",checkpoint,last_summary:summary,step_count:steps,heartbeat_at:now,next_run_at:now,updated_at:now}).eq("id",session.id).eq("status","running");
   if(updateError)throw updateError;
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:ciFailure?"github_ci_failed":completed?"mission_completed":"step_completed",message:ciFailure?"Le Pull Request a été créé, mais les vérifications CI ont échoué. "+summary:summary,metadata:{step_count:steps,next_action:parsed.next_action??"",github_proposal:githubProposal}});
   if(!completed){const {error}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{previous_summary:summary,next_action:parsed.next_action??""}});if(error)throw error;}
   return json({ok:true,claimed:true,completed,session_id:session.id,step_count:steps,summary,github_proposal:githubProposal});
  }catch(error){
   const message=error instanceof Error?error.message:"Erreur worker inconnue.",retry=Number(task.attempt??1)<Number(task.max_attempts??4);
   await admin.from("agent_work_tasks").update({status:retry?"queued":"failed",available_at:new Date(Date.now()+Math.min(300000,5000*2**Number(task.attempt??1))).toISOString(),lease_until:null,last_error:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",task.id);
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"step_retry",message:retry?"Étape interrompue ; nouvelle tentative programmée.":"Étape échouée après plusieurs tentatives.",metadata:{error:message.slice(0,500),attempt:task.attempt}});
   if(!retry)await admin.from("agent_work_sessions").update({status:"failed",last_summary:"Mission arrêtée après plusieurs échecs : "+message.slice(0,500)}).eq("id",session.id);
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
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>2000)return json({error:"Nombre d'étapes invalide."},400);
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
