#!/usr/bin/env python3
"""Run coding prompts against DEBS; generated code is never executed."""
import argparse, datetime as dt, json, os, pathlib, time, urllib.error, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent

def call_gateway(base_url, key, model, messages, timeout):
    payload = {"model": model, "messages": messages, "temperature": 0, "stream": False}
    request = urllib.request.Request(base_url.rstrip("/") + "/chat/completions", data=json.dumps(payload).encode(), headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"}, method="POST")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError("Gateway HTTP %s: %s" % (exc.code, exc.read().decode("utf-8", errors="replace")[:1000])) from exc
    elapsed = time.monotonic() - started
    choices = result.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("Gateway returned no completion choices")
    answer = choices[0].get("message", {}).get("content")
    if not isinstance(answer, str) or not answer.strip():
        raise RuntimeError("Model returned an empty answer")
    return answer, elapsed, result.get("model", model)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("DEBS_INFERENCE_BASE_URL", "http://127.0.0.1:8080/v1"))
    parser.add_argument("--model", default=os.getenv("DEBS_MODEL", "qwen2.5:3b"))
    parser.add_argument("--dataset", type=pathlib.Path, default=ROOT / "evals" / "coding.jsonl")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("coding-eval-report.jsonl"))
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    key = os.getenv("DEBS_INFERENCE_API_KEY")
    if not key: parser.error("Set DEBS_INFERENCE_API_KEY in the environment; do not put it in the dataset.")
    if args.timeout < 1: parser.error("--timeout must be positive")
    items = []
    with args.dataset.open(encoding="utf-8") as source:
        for line_no, line in enumerate(source, 1):
            if line.strip():
                try: item = json.loads(line)
                except json.JSONDecodeError as exc: raise SystemExit("Invalid JSON at line %s: %s" % (line_no, exc))
                if not all(k in item for k in ("id", "category", "messages", "checks")): raise SystemExit("Missing required fields at line %s" % line_no)
                items.append(item)
    if not items: raise SystemExit("Dataset is empty")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    system = "Tu es DEBS, assistant expert en programmation. Réponds en français. Signale les hypothèses et ne prétends jamais avoir exécuté du code ou inspecté des fichiers sans preuve."
    with args.output.open("w", encoding="utf-8") as report:
        for item in items:
            try:
                answer, elapsed, returned_model = call_gateway(args.base_url, key, args.model, [{"role":"system","content":system}, *item["messages"]], args.timeout)
                result = {"id":item["id"],"category":item["category"],"difficulty":item.get("difficulty","unspecified"),"model":returned_model,"requested_model":args.model,"timestamp_utc":stamp,"latency_seconds":round(elapsed,3),"status":"awaiting_manual_review","checks":item["checks"],"answer":answer,"code_execution":"not_performed"}
                print("OK %s (%.1fs) — revue humaine requise" % (item["id"], elapsed))
            except Exception as exc:
                result = {"id":item["id"],"category":item["category"],"model":args.model,"timestamp_utc":stamp,"status":"request_failed","error":str(exc)}
                print("FAIL %s: %s" % (item["id"], exc))
            report.write(json.dumps(result, ensure_ascii=False) + "\n")
    print("Rapport écrit : %s. Pas de notation automatique et aucun code généré exécuté." % args.output)

if __name__ == "__main__": main()
