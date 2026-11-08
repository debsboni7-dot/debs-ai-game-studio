import hmac
import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

app = FastAPI(title="DEBS Inference Gateway", version="0.2.0")
OLLAMA_BASE = os.getenv("OLLAMA_OPENAI_BASE_URL", "http://ollama:11434/v1").rstrip("/")
DEBS_MODEL = os.getenv("DEBS_MODEL", "qwen2.5:3b")
API_KEY = os.getenv("DEBS_INFERENCE_API_KEY", "")
MAX_REQUEST_BYTES = 1_048_576


@app.on_event("startup")
async def require_server_key() -> None:
    if len(API_KEY) < 32:
        raise RuntimeError("DEBS_INFERENCE_API_KEY must contain at least 32 characters")


def authorize(authorization: str | None) -> None:
    expected = f"Bearer {API_KEY}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid DEBS inference credentials")


@app.get("/health")
async def health() -> JSONResponse:
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            response = await client.get(OLLAMA_BASE.removesuffix("/v1") + "/api/tags")
            response.raise_for_status()
        return JSONResponse({"ok": True, "service": "debs-inference", "model": DEBS_MODEL})
    except httpx.HTTPError:
        return JSONResponse({"ok": False, "service": "debs-inference", "model": DEBS_MODEL}, status_code=503)


@app.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    authorization: str | None = Header(default=None),
) -> StreamingResponse | JSONResponse:
    authorize(authorization)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="Request body exceeds 1 MiB limit")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length") from exc
    raw_body = await request.body()
    if len(raw_body) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Request body exceeds 1 MiB limit")
    try:
        payload: Any = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")
    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=422, detail="A non-empty messages array is required")
    if any(not isinstance(item, dict) or item.get("role") not in {"system", "user", "assistant", "tool"} for item in messages):
        raise HTTPException(status_code=422, detail="Each message must have a supported role")
    payload["model"] = DEBS_MODEL
    client = httpx.AsyncClient(timeout=None)
    try:
        upstream_request = client.build_request(
            "POST",
            f"{OLLAMA_BASE}/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        upstream = await client.send(upstream_request, stream=bool(payload.get("stream", False)))
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Local model runtime is unavailable") from exc

    if upstream.status_code >= 400:
        body = await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        return JSONResponse(
            {"error": {"message": body.decode("utf-8", errors="replace")[:1000], "type": "inference_error"}},
            status_code=upstream.status_code,
        )

    async def close_upstream() -> None:
        await upstream.aclose()
        await client.aclose()

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "text/event-stream"),
        background=BackgroundTask(close_upstream),
    )
