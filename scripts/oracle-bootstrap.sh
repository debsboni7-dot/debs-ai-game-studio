#!/usr/bin/env bash
set -Eeuo pipefail
# Run from repository root as the ubuntu user: bash scripts/oracle-bootstrap.sh
if [[ "${EUID}" -eq 0 ]]; then echo "Run as ubuntu user, not root." >&2; exit 1; fi
if [[ ! -f /etc/os-release ]] || ! grep -q Ubuntu /etc/os-release; then echo "Ubuntu only." >&2; exit 1; fi
if [[ "$(dpkg --print-architecture)" != arm64 ]]; then echo "Expected Oracle Ampere ARM64." >&2; exit 1; fi
if [[ ! -f inference/docker-compose.yml || ! -f inference/Caddyfile ]]; then echo "Run from repository root." >&2; exit 1; fi
command -v sudo >/dev/null 2>&1 || { echo "sudo required." >&2; exit 1; }

echo "Installing Docker and required utilities..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl docker.io docker-compose-v2 openssl
sudo systemctl enable --now docker

read -r -p "DuckDNS subdomain label (without .duckdns.org): " DUCKDNS_SUBDOMAIN
if [[ ! "$DUCKDNS_SUBDOMAIN" =~ ^[a-z0-9-]{1,32}$ ]]; then echo "Invalid DuckDNS label." >&2; exit 1; fi
read -r -s -p "DuckDNS token (hidden): " DUCKDNS_TOKEN
echo
if [[ -z "$DUCKDNS_TOKEN" || "$DUCKDNS_TOKEN" =~ [[:space:]] ]]; then echo "Invalid DuckDNS token." >&2; exit 1; fi

DEBS_INFERENCE_API_KEY="$(openssl rand -hex 32)"
SEARXNG_SECRET="$(openssl rand -hex 32)"
DEBS_DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
umask 077
cat > inference/.env <<EOF
DEBS_DOMAIN=${DEBS_DOMAIN}
DUCKDNS_SUBDOMAIN=${DUCKDNS_SUBDOMAIN}
DUCKDNS_TOKEN=${DUCKDNS_TOKEN}
DEBS_INFERENCE_API_KEY=${DEBS_INFERENCE_API_KEY}
SEARXNG_SECRET=${SEARXNG_SECRET}
DEBS_MODEL=qwen2.5:3b
DEBS_MAX_CONCURRENT_REQUESTS=1
OLLAMA_NUM_PARALLEL=1
EOF
chmod 600 inference/.env
unset DUCKDNS_TOKEN DEBS_INFERENCE_API_KEY SEARXNG_SECRET

echo "Starting DEBS. First model download may take several minutes..."
sudo docker compose --env-file inference/.env -f inference/docker-compose.yml up -d --build
echo
echo "Public API: https://${DEBS_DOMAIN}/v1"
echo "Health:     https://${DEBS_DOMAIN}/health"
echo "Check logs with: sudo docker compose --env-file inference/.env -f inference/docker-compose.yml logs -f model-init debs-inference caddy duckdns"
echo "Keep inference/.env private. Never commit or share it."
