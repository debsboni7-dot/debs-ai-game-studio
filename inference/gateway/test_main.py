import os

os.environ.setdefault("DEBS_INFERENCE_API_KEY", "test-secret-that-is-at-least-32-characters")

from fastapi.testclient import TestClient

import main


def test_chat_requires_authentication():
    with TestClient(main.app) as client:
        response = client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "hi"}]})
    assert response.status_code == 401


def test_chat_rejects_empty_messages():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": []},
        )
    assert response.status_code == 422


def test_chat_rejects_invalid_message_role():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "root", "content": "hi"}]},
        )
    assert response.status_code == 422


def test_chat_rejects_oversized_request():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {main.API_KEY}",
                "Content-Length": str(main.MAX_REQUEST_BYTES + 1),
            },
            content=b"{}",
        )
    assert response.status_code == 413


def test_chat_rejects_non_boolean_stream_flag():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "user", "content": "hi"}], "stream": "yes"},
        )
    assert response.status_code == 422


def test_chat_rejects_oversized_message_text():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "user", "content": "x" * (main.MAX_TEXT_CHARS + 1)}]},
        )
    assert response.status_code == 413


def test_chat_rejects_too_many_messages():
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "user", "content": "hi"}] * (main.MAX_MESSAGES + 1)},
        )
    assert response.status_code == 413


class FakeUpstreamResponse:
    def __init__(self, status_code=200, body=b'{"choices":[{"message":{"content":"Bonjour depuis DEBS"}}]}'):
        self.status_code = status_code
        self.headers = {"content-type": "application/json"}
        self.body = body
        self.closed = False
        self.iterated = False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("upstream unavailable")

    def json(self):
        return {"models": [{"name": main.DEBS_MODEL}]} if self.body == b"health" else {}

    async def aread(self):
        return self.body

    async def aclose(self):
        self.closed = True

    async def aiter_raw(self):
        self.iterated = True
        yield self.body


class FakeAsyncClient:
    instances = []
    next_response = None
    health_body = b"health"

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs
        self.request = None
        self.sent_stream = None
        self.upstream_response = None
        self.closed = False
        type(self).instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        await self.aclose()

    async def get(self, _url):
        response = FakeUpstreamResponse(body=type(self).health_body)
        return response

    def build_request(self, method, url, **kwargs):
        self.request = {"method": method, "url": url, **kwargs}
        return self.request

    async def send(self, request, stream=False):
        self.request = request
        self.sent_stream = stream
        self.upstream_response = type(self).next_response or FakeUpstreamResponse()
        return self.upstream_response

    async def aclose(self):
        self.closed = True


def reset_fake_client():
    FakeAsyncClient.instances = []
    FakeAsyncClient.next_response = None
    FakeAsyncClient.health_body = b"health"


def test_health_reports_model_ready(monkeypatch):
    reset_fake_client()
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    with TestClient(main.app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "service": "debs-inference", "model_ready": True}


def test_health_reports_model_not_ready(monkeypatch):
    reset_fake_client()
    FakeAsyncClient.health_body = b'{"models":[]}'
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    with TestClient(main.app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["model_ready"] is False


def test_chat_forwards_request_and_returns_upstream_response(monkeypatch):
    reset_fake_client()
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={
                "model": "client-selected-model",
                "messages": [{"role": "user", "content": "Bonjour"}],
                "stream": False,
            },
        )

    assert response.status_code == 200
    assert response.json()["choices"][0]["message"]["content"] == "Bonjour depuis DEBS"
    assert FakeAsyncClient.instances[0].request["json"]["model"] == main.DEBS_MODEL
    assert FakeAsyncClient.instances[0].sent_stream is False
    assert FakeAsyncClient.instances[0].closed is True
    assert FakeAsyncClient.instances[0].upstream_response.iterated is False


def test_chat_streams_upstream_chunks(monkeypatch):
    reset_fake_client()
    FakeAsyncClient.next_response = FakeUpstreamResponse(
        body=b'data: {"choices":[{"delta":{"content":"Salut"}}]}\\n\\n'
    )
    FakeAsyncClient.next_response.headers = {"content-type": "text/event-stream"}
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "user", "content": "Salut"}], "stream": True},
        )

    assert response.status_code == 200
    assert "Salut" in response.text
    assert FakeAsyncClient.instances[0].sent_stream is True
    assert FakeAsyncClient.instances[0].closed is True
    assert FakeAsyncClient.instances[0].upstream_response.iterated is True


def test_chat_returns_generic_upstream_error(monkeypatch):
    reset_fake_client()
    FakeAsyncClient.next_response = FakeUpstreamResponse(status_code=500, body=b"private upstream details")
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)

    with TestClient(main.app) as client:
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"messages": [{"role": "user", "content": "test"}]},
        )

    assert response.status_code == 500
    assert "private upstream details" not in response.text


class FakeSearchResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "results": [
                {
                    "title": "Kenney Game Assets",
                    "url": "https://kenney.nl/assets",
                    "content": "Free game assets and packs.",
                    "engine": "duckduckgo",
                    "publishedDate": "2026-11-01",
                },
                {
                    "title": "Unsafe local result",
                    "url": "http://127.0.0.1/admin",
                    "content": "must be filtered",
                },
                {
                    "title": "Invalid result",
                    "url": "javascript:alert(1)",
                    "content": "must be filtered",
                },
            ]
        }


class FakeSearchClient:
    instances = []

    def __init__(self, *args, **kwargs):
        self.kwargs = kwargs
        self.url = None
        self.params = None
        type(self).instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url, params=None):
        self.url = url
        self.params = params
        return FakeSearchResponse()


def test_web_search_requires_authentication():
    with TestClient(main.app) as client:
        response = client.post("/v1/search", json={"query": "Kenney game assets"})
    assert response.status_code == 401


def test_web_search_requires_configured_searxng(monkeypatch):
    monkeypatch.setattr(main, "SEARXNG_BASE_URL", "")
    with TestClient(main.app) as client:
        response = client.post(
            "/v1/search",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"query": "Kenney game assets"},
        )
    assert response.status_code == 503


def test_web_search_returns_only_safe_https_sources(monkeypatch):
    FakeSearchClient.instances = []
    monkeypatch.setattr(main, "SEARXNG_BASE_URL", "http://searxng:8080")
    monkeypatch.setattr(main.httpx, "AsyncClient", FakeSearchClient)

    with TestClient(main.app) as client:
        response = client.post(
            "/v1/search",
            headers={"Authorization": f"Bearer {main.API_KEY}"},
            json={"query": "Kenney game assets", "limit": 5, "language": "en"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["title"] == "Kenney Game Assets"
    assert body["results"][0]["url"] == "https://kenney.nl/assets"
    assert FakeSearchClient.instances[0].url == "http://searxng:8080/search"
    assert FakeSearchClient.instances[0].params["format"] == "json"


def test_web_search_validates_query_and_limit():
    with TestClient(main.app) as client:
        headers = {"Authorization": f"Bearer {main.API_KEY}"}
        short_query = client.post("/v1/search", headers=headers, json={"query": "x"})
        invalid_limit = client.post("/v1/search", headers=headers, json={"query": "assets", "limit": 99})
    assert short_query.status_code == 422
    assert invalid_limit.status_code == 422
