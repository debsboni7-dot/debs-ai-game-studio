"""Exercise the real DEBS web chat route against a running local Ollama model."""

from __future__ import annotations

import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = os.getenv("DEBS_APP_BASE_URL", "http://127.0.0.1:4173").rstrip("/")
EXPECTED_MODEL = os.getenv("DEBS_MODEL", "qwen2.5:3b")
TIMEOUT_SECONDS = 180


def wait_for_app() -> None:
    deadline = time.monotonic() + 120
    last_error = "application has not responded yet"
    while time.monotonic() < deadline:
        try:
            request = Request(f"{BASE_URL}/api/ai-provider-status")
            with urlopen(request, timeout=5) as response:
                status = json.loads(response.read().decode("utf-8"))
            if status.get("debsConfigured") and status.get("activeProvider") == "DEBS Server":
                print("DEBS_APP_READY provider=DEBS Server")
                return
            last_error = "DEBS provider is not configured in the application runtime"
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
            last_error = str(error)
        time.sleep(2)
    raise RuntimeError(f"DEBS web application did not become ready: {last_error}")


def run_chat() -> None:
    payload = {
        "messages": [
            {
                "role": "user",
                "content": "Réponds en français par une courte salutation.",
            }
        ],
        "task": "chat",
        "attachments": [],
    }
    request = Request(
        f"{BASE_URL}/api/chat-stream",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    events: list[dict] = []
    text_parts: list[str] = []
    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise RuntimeError(f"Chat route returned HTTP {response.status}")
        content_type = response.headers.get("Content-Type", "")
        if "application/x-ndjson" not in content_type:
            raise RuntimeError(f"Unexpected chat response content type: {content_type}")

        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            event = json.loads(line)
            events.append(event)
            if event.get("type") == "text" and isinstance(event.get("delta"), str):
                text_parts.append(event["delta"])
            elif event.get("type") == "error":
                raise RuntimeError(f"DEBS chat stream returned an error: {event.get('message', 'unknown error')}")

    answer = "".join(text_parts).strip()
    done = next((event for event in reversed(events) if event.get("type") == "done"), None)
    if not answer:
        raise RuntimeError("The DEBS chat route returned no assistant text")
    if not done or done.get("provider") != "DEBS Server":
        raise RuntimeError("The chat stream did not confirm the DEBS Server provider")
    actual_model = str(done.get("model", ""))
    if actual_model and EXPECTED_MODEL not in actual_model:
        raise RuntimeError(f"Unexpected model reported by DEBS: {actual_model}")

    print(
        f"DEBS_APP_INFERENCE_OK provider=DEBS Server "
        f"model={actual_model or EXPECTED_MODEL} events={len(events)}"
    )
    print(f"Assistant response: {answer[:500]}")


if __name__ == "__main__":
    try:
        wait_for_app()
        run_chat()
    except Exception as error:
        print(f"DEBS_APP_INFERENCE_FAILED: {error}", file=sys.stderr)
        raise
