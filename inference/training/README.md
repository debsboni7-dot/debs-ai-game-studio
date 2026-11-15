# DEBS AI Training Worker

This is a separate, private GPU workload. It is not a Cloudflare Worker and it does not call Gemini, Claude, OpenAI or a hosted model API. It downloads the selected open-weight base checkpoint from its model repository, fine-tunes an adapter locally on the GPU host, evaluates it, and stores versioned artifacts in the configured private Cloudflare R2 bucket.

## What is implemented

- Authenticated admin API queues training jobs in the isolated DEBS development database.
- A service-role-only Postgres RPC claims one queued job atomically with `FOR UPDATE SKIP LOCKED`.
- The worker retrieves approved dataset rows, validates consent/PII review and prepares deterministic train/validation/test JSONL files.
- QLoRA 4-bit or LoRA training runs on a CUDA GPU using Transformers and PEFT.
- Validation and held-out test metrics are recorded.
- Adapter, tokenizer, metrics and a release manifest are uploaded to private R2.
- A candidate release is written to the model registry and awaits human approval.
- Approval does not silently switch the live inference model. Runtime packaging and deployment are a separate, explicit step.

## Dataset format

One JSON object per line:

```json
{"input":"Explain a variable","target":"A variable stores a value.","split":"train","pii_reviewed":true,"consent_confirmed":true,"source_reference":"Owned tutorial notes"}
```

Every dataset needs at least one row in each of `train`, `validation` and `test`. Only include data that DEBS AI Studio owns or is authorized to use. Review all examples for personal data, secrets, copyrighted material and license restrictions. The preparation step rejects common email, phone and secret-token patterns; this is a guardrail, not a complete privacy scanner.

## Prepare the private GPU host

1. Provision an Ubuntu 22.04/24.04 GPU VM with an NVIDIA GPU and a compatible driver. The actual instance and price must be selected separately.
2. Clone the private repository on the VM.
3. Run `bash infra/gpu/bootstrap-ubuntu.sh` from the repository root. Verify `nvidia-smi` and Docker GPU access.
4. Create `inference/training/.env` from `.env.example`. Use the **development** Supabase URL and a service-role secret that is never sent to the browser. Create a private R2 bucket and scoped R2 credentials.
5. Start the worker from `inference/training` with `docker compose up -d --build`.
6. The worker polls the queue and claims jobs. To inspect logs: `docker compose logs -f debs-training-worker`.

The worker container has no inbound published ports. Restrict SSH at the provider firewall to your own IP. Do not expose Ollama's 11434 port or the training worker. The inference gateway should be reachable only through a private network or a TLS reverse proxy with authentication.

## Required server secrets

- `SUPABASE_URL`: isolated development project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for the training worker.
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: private artifact storage.
- `DEBS_TRAINING_WORKER_ID`: stable worker identity.

Never commit `.env` files, paste secrets into chat, or configure these values as `VITE_*` browser variables.

## Current limitations

- First supported checkpoint is `Qwen/Qwen2.5-3B-Instruct`; review the exact model card and license before confirming the checkbox in the console.
- Training produces a PEFT adapter, not a new foundation model.
- The current Ollama inference service does not yet hot-load these PEFT adapters. A separate packaging/deployment step (merge, conversion to a supported runtime format, staging, smoke tests and rollback) is required before a release can become the active chat model.
- R2 bucket, GPU VM, secrets and real training have not been provisioned or executed by this repository change.
- The first-run pipeline should be tested with a tiny, owned dataset before any larger or paid training job.
