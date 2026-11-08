import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createMissionPullRequest, inspectPullRequestChecks, readCheckAnnotations, updateMissionPullRequestBranch } from "./github-executor.ts";
import { validateProposedFiles, type ProposedFile } from "../_shared/github-validation.ts";
import { canResumeMission, validateMissionCreateInput } from "../_shared/mission-security.ts";
import { buildAgentCompletionPayload, extractAgentCompletionText } from "./debs-inference.ts";
import { resolveRelativeRepositoryImports, selectRelevantRepositoryFiles } from "./repository-context.ts";
import { createUnifiedDiff, summarizeReviewFiles } from "./review-diff.ts";
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
  const inferenceBase=env("DEBS_INFERENCE_BASE_URL").replace(/\/+$/, "");
  const inferenceKey=env("DEBS_INFERENCE_API_KEY");
  if(!inferenceBase||!inferenceKey)return json({error:"Serveur d’inférence DEBS non configuré : DEBS_INFERENCE_BASE_URL et DEBS_INFERENCE_API_KEY sont requis."},503);
  if(!inferenceBase.startsWith("https://"))return json({error:"DEBS_INFERENCE_BASE_URL doit utiliser HTTPS."},503);
  const {data:claimed,error:claimError}=await admin.rpc("claim_agent_work_task",{p_lease_seconds:180});
  if(claimError)return json({error:"Réservation de tâche impossible.",detail:claimError.message},500);
  const task=Array.isArray(claimed)?claimed[0]:claimed;if(!task)return json({ok:true,claimed:false});
  const {data:session,error:sessionError}=await admin.from("agent_work_sessions").select("*").eq("id",task.session_id).single();
  if(sessionError||!session)return json({error:"Mission introuvable."},500);
  try{
   if(task.task_type==="github_ci_check"){
    const proposal=(task.input??{}) as {url?:string;number?:number;branch?:string;head_sha?:string;poll_count?:number;repair_count?:number};
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
     await admin.from("agent_work_sessions").update({status:"queued",checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},last_summary:"Pull Request créé ; vérifications CI en cours.",heartbeat_at:new Date().toISOString(),next_run_at:nextAt,updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
     await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"github_ci_pending",message:"Les vérifications GitHub sont encore en cours ; nouveau contrôle programmé.",metadata:eventMetadata});
     const {error:nextError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_check",max_attempts:4,available_at:nextAt,input:{...proposal,poll_count:pollCount}});
     if(nextError)throw nextError;
     return json({ok:true,claimed:true,ci_state:"pending",session_id:session.id,poll_count:pollCount});
    }
    const finalSummary=checks.state==="success"?"Les vérifications GitHub ont réussi.":"Les vérifications GitHub ont échoué : "+(checks.failed_checks.join(", ")||"résultat incomplet ou délai de suivi atteint.");
    await admin.from("agent_work_tasks").update({status:"completed",result:{checks},lease_until:null,updated_at:new Date().toISOString()}).eq("id",task.id);
    if(checks.state==="failure"&&Number(proposal.repair_count??0)<2){
     const annotations=await readCheckAnnotations(proposal.head_sha);
     await admin.from("agent_work_sessions").update({status:"queued",last_summary:"Échec CI détecté ; préparation d'une correction contrôlée.",checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},heartbeat_at:new Date().toISOString(),next_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
     const {error:repairError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_repair",max_attempts:2,input:{...proposal,repair_count:Number(proposal.repair_count??0)+1,checks,annotations}});
     if(repairError)throw repairError;
     await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"github_ci_repair_started",message:"Échec CI détecté ; l'agent prépare une correction (tentative "+(Number(proposal.repair_count??0)+1)+"/2).",metadata:{...eventMetadata,annotations}});
     return json({ok:true,claimed:true,ci_state:"failure",repair_scheduled:true,session_id:session.id});
    }
    const finalStatus=checks.state==="success"?"completed":"failed";
    await admin.from("agent_work_sessions").update({status:finalStatus,last_summary:finalSummary,checkpoint:{...(session.checkpoint??{}),github_proposal:{...proposal,checks}},heartbeat_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",session.id).eq("status","running");
    await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:checks.state==="success"?"github_ci_passed":"github_ci_failed",message:finalSummary,metadata:eventMetadata});
    return json({ok:true,claimed:true,ci_state:checks.state,session_id:session.id});
   }
   const checkpointState=session.checkpoint&&typeof session.checkpoint==="object"&&!Array.isArray(session.checkpoint)?session.checkpoint as Record<string,unknown>:{};
   const existingPlan=checkpointState.plan&&typeof checkpointState.plan==="object"?checkpointState.plan as Record<string,unknown>:null;
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),95000);
   const prompt=[
    "Tu es le worker autonome de DEBS AI. Avance une mission en une seule étape courte, vérifiable et récupérable.",
    "Ne prétends jamais avoir modifié un dépôt, exécuté un test ou appelé un outil externe sans l'avoir réellement fait.",
    "Réponds uniquement avec un JSON valide : { \"done\": boolean, \"summary\": string, \"checkpoint\": object, \"next_action\": string, \"files\": [{ \"path\": string, \"content\": string }] }.",
    "Étudie d'abord les extraits de fichiers fournis. Respecte les conventions et l'architecture existantes ; ne remplace pas un fichier entier sans nécessité. Si le contexte est insuffisant, explique-le et ne propose pas de code spéculatif.",
    task.task_type==="github_ci_repair"?"Pour une réparation CI, retourne uniquement le correctif minimal dans files, sans planification et sans modifier les workflows.":"Une mission normale se déroule en deux phases. Sans plan dans le contexte, réalise uniquement la planification : retourne plan={summary:string,steps:[{title:string,description:string,files:string[]}]}, avec 1 à 12 étapes, files=[], done=false. Ne génère pas encore de code. Si un plan existe, respecte-le et produis une proposition cohérente dans files (maximum 12 fichiers), puis done=true. Les fichiers seront présentés dans un diff ; aucun PR ne sera créé avant validation explicite de l’utilisateur. N’inclus aucun secret, aucun fichier .env et n’affirme jamais avoir exécuté des tests. Si aucun changement concret n’est prêt, files doit être [].",
    "Pour une tâche github_ci_repair, propose uniquement le correctif minimal des erreurs CI. Les fichiers seront commités sur la branche du PR existant ; ne crée pas une nouvelle branche et ne modifie jamais .github/workflows.",
    "Objectif : "+String(session.goal??"").slice(0,4000),"Checkpoint : "+JSON.stringify(session.checkpoint??{}).slice(0,1500),
    "Résultat précédent / diagnostics CI : "+JSON.stringify(task.input??{}).slice(0,1500),"TÂCHE DE RÉPARATION : "+(task.task_type==="github_ci_repair"?"Tu dois corriger uniquement les causes des contrôles CI échoués. Lis les fichiers de la branche du PR, corrige les erreurs indiquées par les annotations, ne touche pas aux workflows ni aux secrets, et ne fais pas de refonte sans rapport. Retourne uniquement les fichiers modifiés nécessaires.":"Mission normale."),"Plan déjà établi : "+JSON.stringify(existingPlan??{}).slice(0,5000),"Étape : "+(Number(session.step_count??0)+1)+" / "+session.max_steps,
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
      const repairPaths=Array.isArray(task.input?.annotations)?task.input.annotations.map((a:{path?:string})=>String(a.path??"")).filter(Boolean):[];
      const ranked=selectRelevantRepositoryFiles(paths.map((x:{path:string;size?:number})=>({path:x.path,size:x.size??0})),String(session.goal??""),repairPaths,8);
      const selected=ranked.slice(0,5);
      const contents:Array<{path:string;content:string}>=[];let total=0;
      const loaded=new Set<string>();
      const readRepositoryFile=async(path:string)=>{
        if(loaded.has(path)||total>=14000)return "";
        try{
          const fileResponse=await fetch("https://api.github.com/repos/"+repo+"/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch),{headers});
          if(!fileResponse.ok)return "";
          const fileData=await fileResponse.json();
          if(fileData.type!=="file"||typeof fileData.content!=="string"||fileData.encoding!=="base64")return "";
          const binary=atob(fileData.content.replace(/\\s/g,""));
          const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
          const text=new TextDecoder().decode(bytes).slice(0,Math.min(3000,14000-total));
          if(!text)return "";
          contents.push({path,content:text});loaded.add(path);total+=text.length;
          return text;
        }catch{return "";}
      };
      for(const item of selected)await readRepositoryFile(item.path);
      const availablePaths=ranked.map(x=>x.path);
      const dependencyPaths=new Set<string>();
      for(const item of contents.slice(0,5)){
        for(const dependency of resolveRelativeRepositoryImports(item.path,item.content,availablePaths,3)){
          if(!loaded.has(dependency))dependencyPaths.add(dependency);
        }
      }
      for(const dependency of [...dependencyPaths].slice(0,3))await readRepositoryFile(dependency);
      return {branch,truncated:Boolean(treeData.truncated),files:ranked.slice(0,60).map(x=>x.path),contents};
    }catch{return {files:[],contents:[],warning:"Contexte GitHub indisponible."};}})()),
    "Échéance : "+session.deadline_at
   ].join("\n\n");
   const boundedPrompt=prompt.length>19000?prompt.slice(0,19000):prompt;
   const response=await fetch(inferenceBase+"/chat/completions",{method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+inferenceKey,"Content-Type":"application/json"},
    body:JSON.stringify(buildAgentCompletionPayload(env("DEBS_MODEL")||"qwen2.5:3b",boundedPrompt))});
   clearTimeout(timeout);if(!response.ok)throw new Error("Serveur d’inférence DEBS HTTP "+response.status+".");
   const payload=await response.json();const outputText=extractAgentCompletionText(payload);
   let parsed:{done?:boolean;summary?:string;checkpoint?:Record<string,unknown>;next_action?:string;plan?:unknown;files?:ProposedFile[]};
   try{parsed=JSON.parse(outputText);}catch{parsed={done:false,summary:outputText.slice(0,4000),checkpoint:{raw:outputText.slice(0,12000)},next_action:"Reprendre depuis ce résultat."};}
   const now=new Date().toISOString(),steps=Number(session.step_count??0)+1,expired=Date.now()>=new Date(session.deadline_at).getTime();
   if(task.task_type==="agent_step"&&!existingPlan){
    const candidate=parsed.plan&&typeof parsed.plan==="object"&&!Array.isArray(parsed.plan)?parsed.plan as Record<string,unknown>:null;
    const planSummary=typeof candidate?.summary==="string"?candidate.summary.trim():"";
    const planSteps=Array.isArray(candidate?.steps)?candidate.steps:[];
    if(planSummary.length<8||planSteps.length<1||planSteps.length>12)throw new Error("Le plan de mission est absent ou invalide ; aucune modification n'a été préparée.");
    const safePlan={summary:planSummary.slice(0,3000),steps:planSteps.slice(0,12).map((item,index)=>{
     const step=item&&typeof item==="object"?item as Record<string,unknown>:{};
     return {title:String(step.title??("Étape "+(index+1))).slice(0,160),description:String(step.description??"").slice(0,1000),files:Array.isArray(step.files)?step.files.filter((x):x is string=>typeof x==="string").slice(0,12).map(x=>x.slice(0,220)):[]};
    })};
    const nextCheckpoint={...checkpointState,plan:safePlan,phase:"implementation"};
    const {error:taskDoneError}=await admin.from("agent_work_tasks").update({status:"completed",result:{summary:"Plan de mission préparé.",plan:safePlan},lease_until:null,updated_at:now}).eq("id",task.id);
    if(taskDoneError)throw taskDoneError;
    const {error:sessionPlanError}=await admin.from("agent_work_sessions").update({status:"queued",checkpoint:nextCheckpoint,last_summary:"Plan prêt. DEBS prépare maintenant les modifications prévues.",step_count:steps,heartbeat_at:now,next_run_at:now,updated_at:now}).eq("id",session.id).eq("status","running");
    if(sessionPlanError)throw sessionPlanError;
    const {error:nextTaskError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{phase:"implementation",plan_ready:true}});
    if(nextTaskError)throw nextTaskError;
    await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"mission_plan_ready",message:"Plan de mission préparé ; DEBS passe à la réalisation des changements.",metadata:{plan:safePlan}});
    return json({ok:true,claimed:true,completed:false,plan_ready:true,session_id:session.id,step_count:steps,summary:"Plan préparé."});
   }
   const hasFiles=Array.isArray(parsed.files)&&parsed.files.length>0;
   if(task.task_type==="github_ci_repair"&&!hasFiles)throw new Error("Aucun correctif de code exploitable proposé après analyse des erreurs CI.");
   let completed=parsed.done===true||hasFiles||expired||steps>=Number(session.max_steps);let ciFailure=false;const summary=String(parsed.summary??"Étape terminée.").slice(0,4000);
   if(hasFiles&&task.task_type!=="github_ci_repair"){
    const proposed=validateProposedFiles(parsed.files);
    const token=env("GITHUB_TOKEN"),repository=env("GITHUB_REPOSITORY"),baseBranch=env("GITHUB_BASE_BRANCH")||"main";
    if(!token||!repository)throw new Error("GitHub non configuré pour préparer l'aperçu du diff.");
    const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
    const diffParts:string[]=[];
    for(const file of proposed){
     const fileUrl="https://api.github.com/repos/"+repository+"/contents/"+file.path.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(baseBranch);
     const originalResponse=await fetch(fileUrl,{headers});
     let original="";
     if(originalResponse.ok){
      const originalData=await originalResponse.json();
      if(originalData.type==="file"&&typeof originalData.content==="string"&&originalData.encoding==="base64"){
       const binary=atob(originalData.content.replace(/\\s/g,""));
       original=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
      }
     }else if(originalResponse.status!==404)throw new Error("Lecture du fichier de référence impossible : "+file.path+" (HTTP "+originalResponse.status+").");
     diffParts.push(createUnifiedDiff(file.path,original,file.content));
    }
    const fullDiff=diffParts.join("\n\n");
    const reviewProposal={plan:existingPlan,summary,files:proposed,diff:fullDiff.slice(0,30000),files_summary:summarizeReviewFiles(proposed),base_branch:baseBranch,created_at:now};
    const reviewCheckpoint={...checkpointState,phase:"awaiting_review",review_proposal:reviewProposal};
    const {error:taskDoneError}=await admin.from("agent_work_tasks").update({status:"completed",result:{summary,files:reviewProposal.files_summary},lease_until:null,updated_at:now}).eq("id",task.id);
    if(taskDoneError)throw taskDoneError;
    const {error:reviewSessionError}=await admin.from("agent_work_sessions").update({status:"awaiting_review",checkpoint:reviewCheckpoint,last_summary:"Modifications préparées. Le diff attend ta validation avant toute création de PR.",step_count:steps,heartbeat_at:now,updated_at:now}).eq("id",session.id).eq("status","running");
    if(reviewSessionError)throw reviewSessionError;
    await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"changes_ready_for_review",message:"Proposition prête : examine le plan et le diff. Aucun commit ni PR n'a encore été créé.",metadata:{plan:existingPlan,summary,files:reviewProposal.files_summary,diff:reviewProposal.diff}});
    return json({ok:true,claimed:true,completed:false,review_required:true,session_id:session.id,step_count:steps,summary,files:reviewProposal.files_summary});
   }
   const checkpoint=parsed.checkpoint&&typeof parsed.checkpoint==="object"?parsed.checkpoint:{previous:session.checkpoint,latest:summary};
   let githubProposal:Record<string,unknown>|null=null;
   let ciTaskScheduled=false;
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
     const {error:queueSessionError}=await admin.from("agent_work_sessions").update({status:"queued",checkpoint:{...(session.checkpoint??{}),github_proposal:githubProposal},last_summary:"Pull Request créé ; vérifications CI en attente.",step_count:steps,heartbeat_at:now,next_run_at:now,updated_at:now}).eq("id",session.id).eq("status","running");
     if(queueSessionError)throw queueSessionError;
     const {error:ciTaskError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"github_ci_check",max_attempts:4,input:{url:proposal.url,number:proposal.number,branch:proposal.branch,head_sha:proposal.head_sha,poll_count:0,repair_count:proposal.repair_count??0}});
     if(ciTaskError)throw ciTaskError;
     ciTaskScheduled=true;
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
   if(!ciTaskScheduled){
    const {error:updateError}=await admin.from("agent_work_sessions").update({status:ciFailure?"failed":completed?(expired?"expired":"completed"):"queued",checkpoint,last_summary:summary,step_count:steps,heartbeat_at:now,next_run_at:now,updated_at:now}).eq("id",session.id).eq("status","running");
    if(updateError)throw updateError;
   }
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:ciFailure?"github_ci_failed":completed?"mission_completed":"step_completed",message:ciFailure?"Le Pull Request a été créé, mais les vérifications CI ont échoué. "+summary:summary,metadata:{step_count:steps,next_action:parsed.next_action??"",github_proposal:githubProposal}});
   if(!completed&&!githubProposal){const {error}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{previous_summary:summary,next_action:parsed.next_action??""}});if(error)throw error;}
   return json({ok:true,claimed:true,completed,session_id:session.id,step_count:steps,summary,github_proposal:githubProposal});
  }catch(error){
   const message=error instanceof Error?error.message:"Erreur worker inconnue.",retry=Number(task.attempt??1)<Number(task.max_attempts??4);
   await admin.from("agent_work_tasks").update({status:retry?"queued":"failed",available_at:new Date(Date.now()+Math.min(300000,5000*2**Number(task.attempt??1))).toISOString(),lease_until:null,last_error:message.slice(0,1000),updated_at:new Date().toISOString()}).eq("id",task.id).eq("status","running");
   await admin.from("agent_work_events").insert({session_id:session.id,task_id:task.id,event_type:"step_retry",message:retry?"Étape interrompue ; nouvelle tentative programmée.":"Étape échouée après plusieurs tentatives.",metadata:{error:message.slice(0,500),attempt:task.attempt}});
   if(!retry)await admin.from("agent_work_sessions").update({status:"failed",last_summary:"Mission arrêtée après plusieurs échecs : "+message.slice(0,500)}).eq("id",session.id).eq("status","running");
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
  const validated=validateMissionCreateInput(body);
  if(!validated.ok)return json({error:validated.error},400);
  const {goal,hours,maxSteps,title}=validated.value;
  // The browser JWT is validated above; privileged writes are performed only by the
  // service-role client, with the authenticated user's ID fixed server-side.
  const {data:session,error}=await admin.from("agent_work_sessions").insert({user_id:userId,title,goal,requested_hours:hours,deadline_at:new Date(Date.now()+hours*3600000).toISOString(),max_steps:maxSteps,status:"queued"}).select("id,title,status,requested_hours,deadline_at,step_count,max_steps,created_at").single();
  if(error||!session)return json({error:"Création impossible.",detail:error?.message},500);
  const {error:taskError}=await admin.from("agent_work_tasks").insert({session_id:session.id,status:"queued",task_type:"agent_step",input:{initial:true}});
  if(taskError){await admin.from("agent_work_sessions").delete().eq("id",session.id).eq("user_id",userId);return json({error:"Insertion dans la file impossible."},500);}
  const {error:eventError}=await admin.from("agent_work_events").insert({session_id:session.id,event_type:"mission_created",message:"Mission créée et placée dans la file.",metadata:{hours,max_steps:maxSteps}});
  if(eventError){await admin.from("agent_work_tasks").delete().eq("session_id",session.id);await admin.from("agent_work_sessions").delete().eq("id",session.id).eq("user_id",userId);return json({error:"Journalisation de la mission impossible."},500);}
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
  if(action==="resume"&&!canResumeMission(session.status,session.deadline_at))return json({error:"La mission ne peut pas être reprise ou sa durée est dépassée."},409);
  if(["completed","failed","cancelled","expired"].includes(session.status))return json({error:"Mission déjà terminée."},409);
  if(action==="pause"&&!["queued","running"].includes(session.status))return json({error:"Seule une mission en attente ou en cours peut être mise en pause."},409);
  if(action==="resume"&&session.status!=="paused")return json({error:"La mission n'est pas en pause."},409);
  const {data:transition,error}=await admin.from("agent_work_sessions").update({status,next_run_at:new Date().toISOString()}).eq("id",id).eq("user_id",userId).eq("status",session.status).select("id").maybeSingle();
  if(error)return json({error:"Modification impossible."},500);
  if(!transition)return json({error:"La mission a changé d'état. Actualisez son statut avant de réessayer."},409);
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
