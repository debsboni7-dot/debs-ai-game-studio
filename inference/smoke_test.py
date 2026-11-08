"""Real non-streaming inference smoke test for the DEBS gateway (stdlib only)."""
import json
import os
import time
import urllib.error
import urllib.request

BASE_URL = os.getenv("DEBS_SMOKE_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
API_KEY = os.environ["DEBS_INFERENCE_API_KEY"]
EXPECTED_MODEL = os.getenv("DEBS_MODEL", "qwen2.5:3b")


def get_json(url: str, timeout: int = 10) -> tuple[int, dict]:
    request = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


deadline = time.monotonic() + 90
while True:
    try:
        status, health = get_json(f"{BASE_URL}/health", timeout=5)
        if status == 200 and health.get("model_ready") is True:
            break
    except (OSError, ValueError):
        pass
    if time.monotonic() >= deadline:
        raise SystemExit("DEBS gateway did not become ready with the real model")
    time.sleep(3)

payload = {
    "messages": [
        {
            "role": "system",
            "content": "Tu es DEBS, un assistant concis. Réponds en français.",
        },
        {
            "role": "user",
            "content": "Réponds uniquement par une courte salutation en français.",
        },
    ],
    "temperature": 0,
    "max_tokens": 80,
    "stream": False,
}
request = urllib.request.Request(
    f"{BASE_URL}/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    method="POST",
)
started = time.monotonic()
with urllib.request.urlopen(request, timeout=300) as response:
    result = json.loads(response.read().decode("utf-8"))
elapsed = time.monotonic() - started

choices = result.get("choices")
if not isinstance(choices, list) or not choices:
    raise SystemExit("The real model returned no completion choices")
message = choices[0].get("message", {})
content = message.get("content", "")
if not isinstance(content, str) or not content.strip():
    raise SystemExit("The real model returned an empty assistant message")
returned_model = result.get("model", "")
if returned_model and returned_model != EXPECTED_MODEL:
    raise SystemExit(f"Unexpected model in response: {returned_model}")

print(f"REAL_INFERENCE_OK model={EXPECTED_MODEL} elapsed_seconds={elapsed:.1f}")
print(f"Assistant response: {content.strip()[:500]}")
