# DEBS Training Lab — phase 0

This directory establishes a reproducible, provider-independent data and evaluation workflow. It does not claim that DEBS has trained a foundation model yet.

## Current phase

1. Collect permissioned, licensed, or original examples.
2. Normalize them into JSONL chat records.
3. Split train/validation/test by source or conversation, avoiding near-duplicate leakage.
4. Run a fixed evaluation set against the current base model.
5. Only then decide whether LoRA fine-tuning is justified and affordable on available free compute.

## Dataset format

One JSON object per line:

```json
{"messages":[{"role":"system","content":"You are DEBS, a helpful coding assistant."},{"role":"user","content":"Explain a Python list."},{"role":"assistant","content":"A list is an ordered collection..."}],"metadata":{"source":"original","license":"CC0-1.0","task":"coding-basics"}}
```

Do not include private conversations, personal data, credentials, copyrighted training corpora without permission, or unverified web dumps. Keep source/license metadata for every example.

## Evaluation

Use `evals/baseline.jsonl` as a small hand-written smoke set. Evaluate correctness, instruction following, French fluency, coding validity, tool safety and refusal behavior. Record model name, quantization, runtime, date, prompt version and scores in each report. Never compare releases using different evaluation prompts without noting it.

## Compute reality

Free notebook GPU quotas are temporary and cannot host a permanent inference service. Use them only for experiments. The permanent server and training compute are separate decisions. Do not start a training job until a suitable GPU is available and dataset rights are checked.
