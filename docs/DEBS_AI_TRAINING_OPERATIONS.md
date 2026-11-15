# DEBS AI training operations

## Development-only database changes

The following migrations are applied to the isolated Supabase project `debs-ai-billing-dev` (`qkxecdydyeknvgspvsff`) only:

- `20261115074455_debs_ai_training_platform`
- `20261115075110_debs_ai_training_events_admin_insert`
- `20261115075250_debs_ai_release_approval_without_auto_deploy`

The production project has not been changed. The migrations create RLS-protected dataset, dataset-item, training-job, model-release, audit-event and shared-knowledge tables. The existing personal memory table receives a generated full-text search vector and GIN index.

## Admin authorization

The laboratory API requires a verified Supabase user whose trusted `app_metadata.debs_role` claim equals `admin`. Never use `user_metadata` for this authorization because users can edit it.

After creating the owner's verified account in the development Auth project, grant the role through a trusted Supabase Admin API script or the SQL editor using the exact Auth user UUID:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('debs_role', 'admin')
where id = '<AUTH_USER_UUID>';
```

Verify the UUID before running the statement. Sign out and sign back in so the JWT contains the updated app metadata. Do not grant this role to ordinary users. The development Auth project currently has no users, so no account has been promoted by this change.

## Dataset governance

- Dataset creation requires a written provenance and rights basis.
- Each JSONL example must declare `pii_reviewed: true` and `consent_confirmed: true`.
- The preparation worker rejects common email, phone and secret-token patterns. This is a safety filter, not a complete PII scanner.
- All three partitions (train, validation and test) must contain examples.
- The test partition is held out for final metrics.
- Conversations are not automatically ingested. The user must explicitly authorize any data submitted for training.
- The first pipeline supports QLoRA 4-bit and LoRA on `Qwen/Qwen2.5-3B-Instruct`. Review the exact model card and license before checking the model-license confirmation in the console.

## Start the private GPU worker

1. Provision a GPU VM separately and review its hourly/monthly price before creating it.
2. Run `bash infra/gpu/bootstrap-ubuntu.sh` on Ubuntu 22.04/24.04.
3. Create a private Cloudflare R2 bucket and bucket-scoped Object Read & Write credentials. R2 must be subscribed/enabled first; usage can be billable. Do not paste credentials into chat or commit them.
4. Copy `inference/training/.env.example` to `inference/training/.env`, fill the development Supabase URL, service-role key and R2 credentials.
5. Start from `inference/training`: `docker compose up -d --build`.
6. Observe with `docker compose logs -f debs-ai-training-worker`.

The worker uses the service-role secret only inside the private container to claim queued jobs and write artifacts. It has no inbound network port. Restrict SSH at the provider firewall.

## Model lifecycle

`queued → preparing → training → evaluating → awaiting_approval → approved`

The registry stores the adapter and manifest in R2. Human approval changes the candidate to `approved`; it does **not** switch the running Ollama model. A separate packaging and deployment pipeline is still required to merge/convert the adapter into a runtime-supported model, stage it, smoke-test it, activate it and retain rollback.

## Memory

- Personal memories remain controlled by the user's existing `debs_memory_preferences.enabled` setting. If disabled, personal memory is not retrieved.
- Published shared knowledge documents are retrieved using PostgreSQL full-text search.
- Retrieved content is explicitly marked as untrusted reference material in the prompt.
- No conversation is written to memory automatically by this pipeline.
- This is lexical full-text retrieval, not vector/embedding semantic search. A local embedding model and vector index are a later enhancement.

## Deployment status

Implemented in the repository: admin API/UI, dataset ingestion and review, database registry, queue RPC, QLoRA/LoRA worker, R2 artifact upload, model approval, personal/shared memory retrieval and CI tests for dataset preparation.

Not provisioned or verified: a paid GPU VM, R2 subscription/bucket and credentials, development admin claim, production secrets, actual GPU training run, and automatic adapter activation in the chat runtime. Production Supabase remains untouched.
