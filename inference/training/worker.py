import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import boto3
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
R2_ENDPOINT = os.environ["R2_ENDPOINT"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]
R2_BUCKET = os.environ["R2_BUCKET"]
WORKER_ID = os.getenv("DEBS_TRAINING_WORKER_ID", socket.gethostname())
API = SUPABASE_URL + "/rest/v1"
HEADERS = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json"}
ROOT = Path(__file__).resolve().parent

def rest(method: str, path: str, **kwargs):
    headers = {**HEADERS, **kwargs.pop("headers", {})}
    response = requests.request(method, API + path, headers=headers, timeout=60, **kwargs)
    response.raise_for_status()
    if not response.content:
        return None
    return response.json()

def claim_job():
    return rest("POST", "/rpc/debs_claim_ai_training_job", json={"p_worker_id": WORKER_ID})

def update_job(job_id: str, values: dict):
    rest("PATCH", f"/debs_ai_training_jobs?id=eq.{quote(job_id)}", json=values)

def event(job_id: str, event_type: str, details: dict):
    rest("POST", "/debs_ai_training_events", json={"job_id": job_id, "event_type": event_type, "details": details})

def fetch_dataset(dataset_id: str):
    return rest("GET", f"/debs_ai_dataset_items?dataset_id=eq.{quote(dataset_id)}&select=input_text,target_text,split,pii_reviewed,consent_confirmed,source_reference&order=created_at.asc")

def upload_artifacts(directory: Path, prefix: str):
    client = boto3.client(
        "s3", endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )
    for path in directory.rglob("*"):
        if path.is_file():
            key = prefix + "/" + path.relative_to(directory).as_posix()
            client.upload_file(str(path), R2_BUCKET, key)
    return f"r2://{R2_BUCKET}/{prefix}"

def heartbeat_loop(job_id: str, stop: threading.Event):
    while not stop.wait(60):
        now = datetime.now(timezone.utc).isoformat()
        try:
            update_job(job_id, {"heartbeat_at": now, "updated_at": now})
        except Exception as exc:
            print(f"Training heartbeat failed ({exc.__class__.__name__}).", file=sys.stderr)

def process_job(job: dict):
    job_id = job["id"]
    now = datetime.now(timezone.utc).isoformat()
    update_job(job_id, {"status": "preparing", "heartbeat_at": now, "updated_at": now})
    stop_heartbeat = threading.Event()
    heartbeat = threading.Thread(target=heartbeat_loop, args=(job_id, stop_heartbeat), daemon=True)
    heartbeat.start()
    event(job_id, "preparation_started", {"worker_id": WORKER_ID, "base_model": job["base_model"]})
    try:
        items = fetch_dataset(job["dataset_id"])
        if not items:
            raise RuntimeError("Dataset is empty.")
        with tempfile.TemporaryDirectory(prefix="debs-ai-training-") as temporary:
            workspace = Path(temporary)
            raw_path = workspace / "dataset.jsonl"
            with raw_path.open("w", encoding="utf-8") as handle:
                for item in items:
                    handle.write(json.dumps({
                        "input": item["input_text"], "target": item["target_text"], "split": item["split"],
                        "pii_reviewed": item["pii_reviewed"], "consent_confirmed": item["consent_confirmed"],
                    }, ensure_ascii=False) + "\n")
            dataset_dir = workspace / "prepared"
            subprocess.run([
                sys.executable, str(ROOT / "prepare_dataset.py"),
                "--input", str(raw_path), "--output", str(dataset_dir),
            ], check=True, timeout=600)
            config_path = workspace / "config.json"
            config_path.write_text(json.dumps(job.get("config") or {}), encoding="utf-8")
            output_dir = workspace / "output"
            now = datetime.now(timezone.utc).isoformat()
            update_job(job_id, {"status": "training", "heartbeat_at": now, "updated_at": now})
            event(job_id, "training_started", {"worker_id": WORKER_ID, "base_model": job["base_model"]})
            subprocess.run([
                sys.executable, str(ROOT / "train.py"),
                "--dataset-dir", str(dataset_dir),
                "--output-dir", str(output_dir),
                "--base-model", job["base_model"],
                "--method", job.get("training_method", "qlora"),
                "--config", str(config_path),
            ], check=True, timeout=int(os.getenv("DEBS_TRAINING_TIMEOUT_SECONDS", "21600")))
            update_job(job_id, {"status": "evaluating", "heartbeat_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()})
            metrics = json.loads((output_dir / "metrics.json").read_text(encoding="utf-8"))
            dataset_manifest = json.loads((dataset_dir / "dataset-manifest.json").read_text(encoding="utf-8"))
            release_version = "debs-" + datetime.now(timezone.utc).strftime("%Y.%m.%d") + "-" + job_id.replace("-", "")[:8]
            manifest = {
                "schema_version": 1, "version": release_version, "base_model": job["base_model"],
                "training_method": job.get("training_method", "qlora"), "job_id": job_id,
                "dataset_id": job["dataset_id"], "dataset_manifest": dataset_manifest,
                "training_config": job.get("config") or {}, "metrics": metrics,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "artifact_kind": "peft-adapter",
            }
            (output_dir / "release-manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
            artifact_uri = upload_artifacts(output_dir, "models/" + release_version)
            release = rest("POST", "/debs_ai_model_releases", headers={"Prefer": "return=representation"}, json={
                "version": release_version, "base_model": job["base_model"], "training_job_id": job_id,
                "artifact_uri": artifact_uri, "manifest": manifest, "metrics": metrics,
                "status": "awaiting_approval", "created_by": job["requested_by"],
            })
            update_job(job_id, {
                "status": "awaiting_approval", "artifact_uri": artifact_uri, "metrics": metrics,
                "finished_at": datetime.now(timezone.utc).isoformat(), "heartbeat_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            event(job_id, "candidate_created", {"version": release_version, "artifact_uri": artifact_uri, "release_id": release[0]["id"]})
            print(json.dumps({"job_id": job_id, "release": release_version, "status": "awaiting_approval"}))
    except Exception as exc:
        message = (str(exc) or exc.__class__.__name__)[:1500]
        update_job(job_id, {"status": "failed", "error_message": message, "finished_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()})
        event(job_id, "training_failed", {"error": message})
        raise
    finally:
        stop_heartbeat.set()
        heartbeat.join(timeout=5)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=20)
    args = parser.parse_args()
    while True:
        job = claim_job()
        if isinstance(job, list):
            job = job[0] if job else None
        if job:
            process_job(job)
        elif args.once:
            print("No queued DEBS training job.")
            return
        else:
            time.sleep(max(5, min(300, args.poll_seconds)))

if __name__ == "__main__":
    main()
