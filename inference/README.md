# DEBS self-hosted inference (gateway v0.3)

This service runs an open-weight model on infrastructure controlled by DEBS. Chat requests are sent to the local Ollama runtime through a small authenticated OpenAI-compatible gateway. No Gemini, OpenAI, or Lovable AI API is called by this inference service.

## Requirements

- A Linux server or cloud VM with Docker Engine and Docker Compose.
- For comfortable Qwen 2.5 3B inference, plan for sufficient RAM (typically 8 GB or more for model/runtime overhead) and storage; actual speed depends heavily on CPU/GPU and quantization. This is a planning estimate, not a guarantee.
- Enough RAM/storage for the selected model. The default Qwen 2.5 3B model is a small bootstrap model, not a DEBS-trained foundation model.
- For practical interactive speed, a compatible GPU is strongly recommended. CPU mode is suitable only for basic smoke tests and may be slow.

## Start

1. Copy `.env.example` to `.env` and set `DEBS_INFERENCE_API_KEY` to a random secret of at least 32 characters.
2. From this directory run `docker compose up -d --build`.
3. Compose starts Ollama, downloads the configured model automatically through the one-shot `model-init` service, then starts the authenticated gateway.
4. Follow startup with `docker compose logs -f model-init debs-inference`.
5. Check readiness with `curl http://127.0.0.1:8080/health`. A healthy response means the configured model is present in Ollama; HTTP 503 means it is not ready.
5. Test the authenticated endpoint:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $DEBS_INFERENCE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Bonjour"}],"stream":false}'
```

## Connect the DEBS web app

Configure these server-only environment variables in the web app's hosting environment:

- `DEBS_INFERENCE_BASE_URL=https://your-private-inference-host.example/v1`
- `DEBS_INFERENCE_API_KEY=<same secret as the gateway>`
- `DEBS_MODEL=qwen2.5:3b`

The inference gateway must be reachable from the web app server over HTTPS. The Compose file binds the port to localhost by default; put it behind a TLS reverse proxy or private network before connecting a remote web app. Never expose Ollama port 11434 publicly. Never put the key in browser/client variables.

## Runtime safeguards

- The gateway accepts requests up to 24 MiB to support the app's bounded image/file payloads, validates message roles and content, and caps message count and text length.
- Inference concurrency is limited to two requests by default (`DEBS_MAX_CONCURRENT_REQUESTS`), configurable from 1 to 8. The model remains the only inference backend.
- The public health endpoint reports readiness without exposing the API key or model inventory. Swagger/OpenAPI docs are disabled.
- Ollama is not published to the host. The gateway binds to `127.0.0.1:8080`; expose it remotely only through a TLS reverse proxy or private network.

## Important limits

- This is the first self-hosted inference runtime, not a model trained by DEBS.
- Model weights are downloaded separately and remain on the server volume.
- No GPU is provisioned by this repository. Hosting, RAM, GPU time and bandwidth depend on the server you choose.
- Fine-tuning/training, prompt-injected durable memory, tool-use quality, autoscaling, multi-node queueing, TLS reverse-proxy configuration and production monitoring are later milestones.
- Do not claim the app uses this service until the server is running, the secret is configured on the app server and a real chat request succeeds.
