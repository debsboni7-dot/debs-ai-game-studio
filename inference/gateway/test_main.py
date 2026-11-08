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
