import asyncio
import hmac
import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask

app = FastAPI(
    title="DEBS Inference Gateway",
    version="0.3.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
OLLAMA_BASE = os.getenv("OLLAMA_OPENAI_BASE_URL", "http://ollama:11434/v1").rstrip("/")
DEBS_MODEL = os.getenv("DEBS_MODEL", "qwen2.5:3b")
API_KEY = os.getenv("DEBS_INFERENCE_API_KEY", "")
MAX_REQUEST_BYTES = 24 * 1024 * 1024
MAX_MESSAGES = 50
MAX_TEXT_CHARS = 20_000
MAX_CONTENT_PARTS = 12
MAX_CONCURRENT_REQUESTS = max(1, min(8, int(os.getenv("DEBS_MAX_CONCURRENT_REQUESTS", "2"))))
inference_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


@app.on_event("startup")
async def require_server_key() -> None:
    if len(API_KEY) < 32:
        raise RuntimeError("DEBS_INFERENCE_API_KEY must contain at least 32 characters")


def authorize(authorization: str | None) -> None:
    expected = f"Bearer {API_KEY}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid DEBS inference credentials")


def validate_messages(messages: Any) -> None:
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=422, detail="A non-empty messages array is required")
    if len(messages) > MAX_MESSAGES:
        raise HTTPException(status_code=413, detail=f"At most {MAX_MESSAGES} messages are allowed")
    allowed_roles = {"system", "user", "assistant", "tool"}
    for item in messages:
        if not isinstance(item, dict) or item.get("role") not in allowed_roles:
            raise HTTPException(status_code=422, detail="Each message must have a supported role")
        content = item.get("content")
        if isinstance(content, str):
            if len(content) > MAX_TEXT_CHARS:
                raise HTTPException(status_code=413, detail="A message exceeds the text length limit")
        elif isinstance(content, list):
            if len(content) > MAX_CONTENT_PARTS or any(not isinstance(part, dict) for part in content):
                raise HTTPException(status_code=422, detail="Message content parts are invalid")
        elif content is not None:
            raise HTTPException(status_code=422, detail="Message content must be text or a content-parts array")


@app.get("/health")
async def health() -> JSONResponse:
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            response = await client.get(OLLAMA_BASE.removesuffix("/v1") + "/api/tags")
            response.raise_for_status()
        models = response.json().get("models", [])
        available = any(
            isinstance(model, dict)
            and (model.get("name") == DEBS_MODEL or model.get("model") == DEBS_MODEL)
            for model in models
        )
        return JSONResponse(
            {"ok": available, "service": "debs-inference", "model_ready": available},
            status_code=200 if available else 503,
            headers={"Cache-Control": "no-store"},
        )
    except (httpx.HTTPError, ValueError):
        return JSONResponse(
            {"ok": False, "service": "debs-inference", "model_ready": False},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )


@app.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Response:
    authorize(authorization)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="Request body exceeds 24 MiB limit")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length") from exc

    raw_body = await request.body()
    if len(raw_body) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Request body exceeds 24 MiB limit")
    try:
        payload: Any = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")
    validate_messages(payload.get("messages"))
    if "stream" in payload and not isinstance(payload["stream"], bool):
        raise HTTPException(status_code=422, detail="The stream field must be a boolean")

    payload["model"] = DEBS_MODEL
    await inference_slots.acquire()
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=10, read=None, write=30, pool=10),
        limits=httpx.Limits(max_connections=MAX_CONCURRENT_REQUESTS, max_keepalive_connections=MAX_CONCURRENT_REQUESTS),
    )
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
        inference_slots.release()
        raise HTTPException(status_code=502, detail="Local model runtime is unavailable") from exc

    if upstream.status_code >= 400:
        await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        inference_slots.release()
        return JSONResponse(
            {"error": {"message": "The local model rejected the inference request", "type": "inference_error"}},
            status_code=upstream.status_code,
        )

    async def close_upstream() -> None:
        await upstream.aclose()
        await client.aclose()
        inference_slots.release()

    response_headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }
    content_type = upstream.headers.get("content-type", "application/json")

    if not payload.get("stream", False):
        try:
            body = await upstream.aread()
        except httpx.HTTPError as exc:
            await close_upstream()
            raise HTTPException(status_code=502, detail="Local model response could not be read") from exc
        await close_upstream()
        return Response(
            content=body,
            status_code=upstream.status_code,
            media_type=content_type,
            headers=response_headers,
        )

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        media_type=content_type,
        background=BackgroundTask(close_upstream),
        headers=response_headers,
    )
