import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { getServerEnv } from "@/lib/server-env.server";
import { verifyVerifiedEmailBearer, type AuthClientFactory } from "@/lib/auth.server";

const createAuthClient: AuthClientFactory = (url, key) =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type AdminContext = { client: ReturnType<typeof createClient>; userId: string } | { response: Response };

async function requireAdmin(request: Request): Promise<AdminContext> {
  const url = getServerEnv("SUPABASE_URL");
  const key = getServerEnv("SUPABASE_PUBLISHABLE_KEY");
  const auth = await verifyVerifiedEmailBearer(request, url, key, createAuthClient);
  if (!auth.ok) return { response: Response.json({ message: auth.message }, { status: auth.status }) };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const client = createClient(url!, key!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { response: Response.json({ message: "Session invalide." }, { status: 401 }) };
  if (data.user.app_metadata?.debs_role !== "admin") {
    return { response: Response.json({ message: "Accès réservé aux administrateurs DEBS AI." }, { status: 403 }) };
  }
  return { client, userId: data.user.id };
}

async function readJson(request: Request): Promise<any> {
  const raw = await request.text();
  if (raw.length > 1_500_000) throw new Error("La requête dépasse 1,5 Mo.");
  try { return JSON.parse(raw); } catch { throw new Error("JSON invalide."); }
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/ai-lab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const context = await requireAdmin(request);
        if ("response" in context) return context.response;
        const { client } = context;
        const [datasets, jobs, releases, knowledge, events] = await Promise.all([
          client.from("debs_ai_datasets").select("*").order("created_at", { ascending: false }).limit(50),
          client.from("debs_ai_training_jobs").select("*").order("created_at", { ascending: false }).limit(50),
          client.from("debs_ai_model_releases").select("*").order("created_at", { ascending: false }).limit(30),
          client.from("debs_knowledge_documents").select("id,title,source_reference,license_label,is_published,created_at").order("created_at", { ascending: false }).limit(50),
          client.from("debs_ai_training_events").select("*").order("created_at", { ascending: false }).limit(30),
        ]);
        const failed = [datasets, jobs, releases, knowledge, events].find((result) => result.error);
        if (failed?.error) return Response.json({ message: "Lecture du laboratoire impossible." }, { status: 500 });
        return Response.json({
          datasets: datasets.data ?? [], jobs: jobs.data ?? [], releases: releases.data ?? [],
          knowledge: knowledge.data ?? [], events: events.data ?? [],
        }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const context = await requireAdmin(request);
        if ("response" in context) return context.response;
        const { client, userId } = context;
        let body: any;
        try { body = await readJson(request); } catch (error) {
          return Response.json({ message: error instanceof Error ? error.message : "Requête invalide." }, { status: 400 });
        }
        const action = body?.action;
        if (action === "create_dataset") {
          const name = String(body.name ?? "").trim();
          const consent = String(body.consent_basis ?? "").trim();
          if (name.length < 2 || name.length > 120 || consent.length < 8 || consent.length > 1000) {
            return Response.json({ message: "Nom ou base de consentement invalide." }, { status: 400 });
          }
          const { data, error } = await client.from("debs_ai_datasets").insert({
            name, description: String(body.description ?? "").slice(0, 2000),
            consent_basis: consent, license_label: String(body.license_label ?? "Creator-provided; review required").slice(0, 180),
            created_by: userId,
          }).select("*").single();
          if (error) return Response.json({ message: "Création du dataset impossible." }, { status: 400 });
          return Response.json({ dataset: data }, { status: 201 });
        }
        if (action === "import_examples") {
          const datasetId = String(body.dataset_id ?? "");
          const examples = body.examples;
          if (!/^[0-9a-f-]{36}$/i.test(datasetId) || !Array.isArray(examples) || examples.length < 1 || examples.length > 500) {
            return Response.json({ message: "Dataset ou nombre d'exemples invalide (1 à 500 par import)." }, { status: 400 });
          }
          const { data: dataset, error: datasetError } = await client.from("debs_ai_datasets")
            .select("id,status,consent_basis").eq("id", datasetId).single();
          if (datasetError || !dataset || dataset.status === "approved" || dataset.status === "archived") {
            return Response.json({ message: "Dataset introuvable ou verrouillé." }, { status: 409 });
          }
          const rows = [];
          for (const item of examples) {
            const input = String(item?.input ?? "").trim();
            const target = String(item?.target ?? "").trim();
            const split = item?.split;
            if (!input || !target || input.length > 20000 || target.length > 20000 ||
                !["train", "validation", "test"].includes(split) ||
                item?.pii_reviewed !== true || item?.consent_confirmed !== true) {
              return Response.json({ message: "Chaque exemple doit contenir input, target, split et confirmer explicitement la revue PII et les droits d'utilisation." }, { status: 400 });
            }
            rows.push({
              dataset_id: datasetId, input_text: input, target_text: target, split,
              source_reference: String(item.source_reference ?? "").slice(0, 500),
              pii_reviewed: true, consent_confirmed: true,
              content_sha256: await digest(input + "\n" + target), created_by: userId,
            });
          }
          const { error } = await client.from("debs_ai_dataset_items").upsert(rows, { onConflict: "dataset_id,content_sha256", ignoreDuplicates: true });
          if (error) return Response.json({ message: "Import des exemples impossible." }, { status: 400 });
          const { count } = await client.from("debs_ai_dataset_items").select("id", { count: "exact", head: true }).eq("dataset_id", datasetId);
          await client.from("debs_ai_datasets").update({ item_count: count ?? 0, status: "review", updated_at: new Date().toISOString() }).eq("id", datasetId);
          return Response.json({ imported: rows.length, total: count ?? 0 });
        }
        if (action === "approve_dataset") {
          const datasetId = String(body.dataset_id ?? "");
          const { data: items, error } = await client.from("debs_ai_dataset_items")
            .select("split,pii_reviewed,consent_confirmed").eq("dataset_id", datasetId);
          if (error || !items?.length || items.some((item: any) => !item.pii_reviewed || !item.consent_confirmed) ||
              !["train", "validation", "test"].every((split) => items.some((item: any) => item.split === split))) {
            return Response.json({ message: "Dataset incomplet : chaque exemple doit être revu, autorisé, et les trois partitions train/validation/test doivent être présentes." }, { status: 409 });
          }
          const { data, error: updateError } = await client.from("debs_ai_datasets")
            .update({ status: "approved", item_count: items.length, updated_at: new Date().toISOString() })
            .eq("id", datasetId).select("*").single();
          if (updateError) return Response.json({ message: "Approbation impossible." }, { status: 400 });
          return Response.json({ dataset: data });
        }
        if (action === "queue_training") {
          const datasetId = String(body.dataset_id ?? "");
          const baseModel = String(body.base_model ?? "Qwen/Qwen2.5-3B-Instruct");
          const method = body.training_method === "lora" ? "lora" : "qlora";
          if (body.model_license_reviewed !== true) return Response.json({ message: "Confirme d'abord la vérification de la licence du modèle de base." }, { status: 400 });
          const epochs = Math.max(1, Math.min(5, Number(body.epochs) || 1));
          if (baseModel !== "Qwen/Qwen2.5-3B-Instruct") {
            return Response.json({ message: "Le modèle de base autorisé pour ce premier pipeline est Qwen2.5-3B-Instruct." }, { status: 400 });
          }
          const { data: dataset, error: datasetError } = await client.from("debs_ai_datasets")
            .select("id,status").eq("id", datasetId).single();
          if (datasetError || dataset?.status !== "approved") return Response.json({ message: "Approuve d'abord le dataset." }, { status: 409 });
          const { data: items, error: itemError } = await client.from("debs_ai_dataset_items").select("split").eq("dataset_id", datasetId);
          if (itemError || !["train", "validation", "test"].every((split) => items?.some((item: any) => item.split === split))) {
            return Response.json({ message: "Les trois partitions sont obligatoires." }, { status: 409 });
          }
          const { data, error } = await client.from("debs_ai_training_jobs").insert({
            dataset_id: datasetId, base_model: baseModel, training_method: method,
            config: { epochs, learning_rate: 0.0002, batch_size: 1, gradient_accumulation_steps: 8, lora_rank: 8, max_seq_length: 1024, model_license_reviewed: true },
            requested_by: userId,
          }).select("*").single();
          if (error) return Response.json({ message: "Mise en file impossible." }, { status: 400 });
          await client.from("debs_ai_training_events").insert({ job_id: data.id, event_type: "queued", actor_id: userId, details: { base_model: baseModel, method } });
          return Response.json({ job: data }, { status: 201 });
        }
        if (action === "approve_release") {
          const { data, error } = await client.rpc("debs_promote_model_release", { p_release_id: body.release_id });
          if (error) return Response.json({ message: "Activation refusée : " + error.message }, { status: 409 });
          return Response.json({ release: data });
        }
        if (action === "reject_release") {
          const releaseId = String(body.release_id ?? "");
          const { data: release, error } = await client.from("debs_ai_model_releases").update({ status: "rejected", approved_by: userId })
            .eq("id", releaseId).eq("status", "awaiting_approval").select("id,training_job_id").single();
          if (error || !release) return Response.json({ message: "Version candidate introuvable." }, { status: 404 });
          await client.from("debs_ai_training_jobs").update({ status: "rejected", approved_by: userId, updated_at: new Date().toISOString() }).eq("id", release.training_job_id);
          await client.from("debs_ai_training_events").insert({ job_id: release.training_job_id, release_id: releaseId, event_type: "release_rejected", actor_id: userId });
          return Response.json({ ok: true });
        }
        if (action === "create_knowledge") {
          const title = String(body.title ?? "").trim(), content = String(body.content ?? "").trim();
          const consent = String(body.consent_basis ?? "").trim();
          if (title.length < 2 || content.length < 1 || content.length > 50000 || consent.length < 8) {
            return Response.json({ message: "Titre, contenu ou provenance/autorisation invalide." }, { status: 400 });
          }
          const { data, error } = await client.from("debs_knowledge_documents").insert({
            title, content, consent_basis: consent, source_reference: String(body.source_reference ?? "").slice(0, 500),
            license_label: String(body.license_label ?? "").slice(0, 180), created_by: userId,
          }).select("id,title,is_published").single();
          if (error) return Response.json({ message: "Création du document impossible." }, { status: 400 });
          return Response.json({ document: data }, { status: 201 });
        }
        if (action === "publish_knowledge") {
          const { data, error } = await client.from("debs_knowledge_documents")
            .update({ is_published: true, updated_at: new Date().toISOString() })
            .eq("id", String(body.document_id ?? "")).select("id,title,is_published").single();
          if (error) return Response.json({ message: "Publication impossible." }, { status: 400 });
          return Response.json({ document: data });
        }
        return Response.json({ message: "Action inconnue." }, { status: 400 });
      },
    },
  },
});
