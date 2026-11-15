# Free GPU pilot with Kaggle

This is an optional, manually started pilot path for DEBS AI. It does not create a paid server, does not keep a GPU running, and does not replace the production worker.

## Cost and limits

- Use Kaggle Notebooks' free GPU accelerator only. Kaggle documents free P100 access, up to 12 hours per session, 20 GB of auto-saved working storage, and limited availability/queues. Its GPU quota is limited and may vary; check the current quota shown in your Kaggle account before starting.
- Stop the notebook session as soon as training and artifact export finish. Do not enable any paid add-on or attach a billable cloud account.
- Google Colab is a fallback, but its free GPU availability and limits are dynamic and not guaranteed.

Official references:
- https://www.kaggle.com/docs/notebooks
- https://www.kaggle.com/docs/efficient-gpu-usage
- https://research.google.com/colaboratory/faq.html

## What this pilot can do

The existing `prepare_dataset.py` and `train.py` scripts can run in a Kaggle GPU notebook. The first supported checkpoint is `Qwen/Qwen2.5-3B-Instruct`; training creates a PEFT LoRA/QLoRA adapter, not a new foundation model.

## Manual run outline

1. Create a **private** Kaggle Notebook and select Settings → Accelerator → GPU. Enable Internet only if needed to download the public base model and Python packages.
2. Make the repository's `inference/training/` scripts available in the notebook (upload the files from a trusted private source or use a read-only GitHub token stored in Kaggle Secrets; never paste a token into a notebook cell).
3. Add a private dataset file named `dataset.jsonl`. Each line must contain `input`, `target`, `split` (`train`, `validation` or `test`), `pii_reviewed: true`, and `consent_confirmed: true`. Keep at least one example in each split. Use only content DEBS AI Studio owns or is authorized to use.
4. Install the packages listed in `requirements.txt`, then prepare and train:

```bash
python prepare_dataset.py --input /kaggle/input/debs-private-data/dataset.jsonl --output /kaggle/working/prepared

python train.py \
  --dataset-dir /kaggle/working/prepared \
  --output-dir /kaggle/working/debs-output \
  --base-model Qwen/Qwen2.5-3B-Instruct \
  --method qlora \
  --config /kaggle/working/config.json
```

Create `/kaggle/working/config.json` with a small pilot configuration, for example:

```json
{
  "epochs": 1,
  "batch_size": 1,
  "gradient_accumulation_steps": 8,
  "max_seq_length": 512,
  "lora_rank": 8,
  "lora_alpha": 16,
  "learning_rate": 0.0002
}
```

5. Verify `metrics.json`, then archive `/kaggle/working/debs-output/adapter` and its metrics. Save the notebook output only to a private Kaggle artifact or download it securely. Do not publish the dataset or adapter publicly.
6. Stop the GPU session.

## Important boundaries

- This route is a user-started notebook, not an always-on worker. It does not poll the DEBS queue or automatically publish a model release.
- The current private R2 bucket is not provisioned. Do not put R2 credentials in Kaggle until a private bucket and scoped credentials exist.
- Do not upload personal data, secrets, private chat logs, or third-party copyrighted material without documented authorization and review.
- A trained adapter is not ready for live use. It still needs packaging/merging, compatibility conversion, staging tests, approval, and a rollback plan.
- Kaggle and Colab free capacity is best-effort. A run may be queued, interrupted, or unavailable. Resume from checkpoints where possible.
