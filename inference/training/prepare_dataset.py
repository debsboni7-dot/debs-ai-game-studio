import argparse
import hashlib
import json
import re
from pathlib import Path

PII_PATTERNS = [
    re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    re.compile(r"(?<!\w)(?:\+?\d[ .()-]?){8,15}(?!\w)"),
    re.compile(r"(?i)\b(?:sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})\b"),
]

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source = Path(args.input)
    target = Path(args.output)
    target.mkdir(parents=True, exist_ok=True)
    rows = {"train": [], "validation": [], "test": []}
    seen: set[str] = set()
    rejected = 0
    for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        item = json.loads(line)
        prompt = str(item.get("input", "")).strip()
        answer = str(item.get("target", "")).strip()
        split = str(item.get("split", ""))
        if not prompt or not answer or split not in rows:
            raise ValueError(f"Invalid example at line {line_number}")
        if item.get("pii_reviewed") is not True or item.get("consent_confirmed") is not True:
            raise ValueError(f"Missing PII review or consent confirmation at line {line_number}")
        joined = prompt + "\n" + answer
        if any(pattern.search(joined) for pattern in PII_PATTERNS):
            rejected += 1
            continue
        digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        rows[split].append({"input": prompt, "target": answer, "sha256": digest})
    if rejected:
        raise ValueError(f"{rejected} examples contain possible personal data or secrets; remove them and review the source.")
    if any(not rows[name] for name in rows):
        raise ValueError("Train, validation and test partitions must each contain at least one example.")
    for split, items in rows.items():
        (target / f"{split}.jsonl").write_text(
            "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in items), encoding="utf-8"
        )
    manifest = {
        "schema_version": 1,
        "counts": {key: len(value) for key, value in rows.items()},
        "unique_examples": len(seen),
        "sha256": {key: hashlib.sha256((target / f"{key}.jsonl").read_bytes()).hexdigest() for key in rows},
    }
    (target / "dataset-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))

if __name__ == "__main__":
    main()
