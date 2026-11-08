# DEBS coding benchmark

This benchmark measures coding-answer quality separately from application tests. It covers Python, debugging, TypeScript, algorithms, testing, refactoring, security, and honest repository reasoning.

## Run

Start the DEBS inference gateway, then configure DEBS_INFERENCE_BASE_URL, DEBS_INFERENCE_API_KEY, and optionally DEBS_MODEL in the environment. Run:

    python training/run_coding_eval.py --output reports/coding-qwen25-3b.jsonl

The runner records model, timestamp, latency, answer, and review criteria. It does not execute generated code, grade semantic correctness automatically, or claim that a response passed. A human reviewer must mark each criterion.

Never put credentials in datasets, reports, commits, or command-line arguments. Do not include private user data or unlicensed training material. Keep prompts stable when comparing model versions.

## Interpretation

- A completed request proves only that the model returned text.
- awaiting_manual_review is intentional: correctness needs review.
- code_execution=not_performed means generated code was not run.
- This is an evaluation tool, not model training or a secure execution sandbox.
