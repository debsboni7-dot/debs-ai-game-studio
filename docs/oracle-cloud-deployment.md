# DEBS AI Server — Oracle Cloud Always Free deployment

Deploy the self-hosted DEBS inference stack on an Oracle Cloud Ubuntu 24.04 ARM64 VM, with DuckDNS dynamic DNS and Caddy-managed HTTPS. This guide does not create a VM or enable paid resources.

## Cost guardrails

- Create only a Compute shape explicitly marked **Always Free Eligible**.
- Intended starting shape: Ampere A1 Flex, at most 2 OCPUs and 12 GB RAM, subject to current Oracle eligibility and regional capacity.
- Do not enable Pay As You Go, paid support, paid GPU, or paid add-ons.
- Oracle may request a payment card or temporary authorization during account verification. This repository cannot guarantee the bank will show no temporary authorization.
- If the console labels a resource as paid or shows a charge, stop before creating it.

## 1. Create the VM

Choose Ubuntu 24.04 ARM64, Ampere A1 Flex within the Always Free allowance, a public subnet, public IPv4 and an SSH key. Keep the private key private.

In the attached VCN security list or Network Security Group, allow inbound TCP 22 (SSH, preferably restricted to your IP), 80 and 443. Do not open 8080 or 11434.

## 2. Register a DuckDNS name

1. Sign in at https://www.duckdns.org/.
2. Create a subdomain label such as `debs-ai-studio`.
3. Keep the DuckDNS token private. Never paste it into chat or commit it.

The updater container refreshes the public IPv4 record every five minutes.

## 3. Run the bootstrap

Connect to the VM as `ubuntu` over SSH, then:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/debsboni7-dot/debs-ai-game-studio.git
cd debs-ai-game-studio
bash scripts/oracle-bootstrap.sh
```

The script checks Ubuntu ARM64, installs Docker/Compose, asks for the DuckDNS label and hidden token, generates strong gateway and SearXNG secrets locally, writes owner-only `inference/.env`, and starts Ollama, Qwen 2.5 3B, SearXNG, the FastAPI gateway, Caddy and DuckDNS updater.

The first model download takes time and bandwidth. CPU-only inference on 2 OCPUs may be slow; concurrency is set to one.

## 4. Verify DNS, TLS and inference

Wait until DuckDNS resolves to the VM public IPv4. Ensure OCI ingress and the VM firewall allow ports 80/443.

On the VM:

```bash
sudo docker compose --env-file inference/.env -f inference/docker-compose.yml ps
sudo docker compose --env-file inference/.env -f inference/docker-compose.yml logs --tail=100 model-init debs-inference caddy duckdns
```

From another device:

```bash
curl -fsS https://YOUR-SUBDOMAIN.duckdns.org/health
```

A healthy response proves gateway readiness, not a successful model completion. Test a real chat completion on the VM without printing secrets:

```bash
set -a
. inference/.env
set +a
curl -fsS https://${DEBS_DOMAIN}/v1/chat/completions \
  -H "Authorization: Bearer ${DEBS_INFERENCE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Réponds exactement : DEBS AI opérationnelle."}],"stream":false}'
unset DEBS_INFERENCE_API_KEY SEARXNG_SECRET DUCKDNS_TOKEN
```

Do not enable shell tracing (`set -x`) while secrets are loaded.

## 5. Connect Supabase after real inference succeeds

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, set:
- `DEBS_INFERENCE_BASE_URL=https://YOUR-SUBDOMAIN.duckdns.org/v1`
- `DEBS_INFERENCE_API_KEY` to the value stored in the VM's private `inference/.env`.
- `DEBS_MODEL=qwen2.5:3b`
- `AGENT_WORKER_SECRET` to a separate random secret.
- `GITHUB_TOKEN` with only the repository permissions required by the agent.
- `GITHUB_REPOSITORY=debsboni7-dot/debs-ai-game-studio`
- `GITHUB_BASE_BRANCH=main`

Supabase usually injects its own project URL and keys into Edge Function runtime. Verify built-in values before adding duplicates. Never expose secrets to browser code.

The `agent-work` Edge Function is deployed, but its worker scheduler is not yet enabled. Configure it only after HTTPS and real inference are verified.

## Operations

- Restart: `sudo docker compose --env-file inference/.env -f inference/docker-compose.yml restart`
- Logs: `sudo docker compose --env-file inference/.env -f inference/docker-compose.yml logs -f`
- Stop: `sudo docker compose --env-file inference/.env -f inference/docker-compose.yml down`
- Ollama model persists in `ollama_data`. Avoid `down -v` unless deleting model data is intended.

## Limits

This runs Qwen open weights; it is not a foundation model trained from scratch by DEBS AI Studio. CPU-only inference on a small free VM is a prototype/test target, not high-throughput production. Oracle controls Always Free eligibility and availability. Caddy can issue a certificate only after DNS points to the VM and ports 80/443 are reachable. Ollama and the gateway are not published directly to the internet.
