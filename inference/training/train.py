import argparse
import json
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig,
    DataCollatorForLanguageModeling, Trainer, TrainingArguments,
)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--method", choices=["lora", "qlora"], default="qlora")
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("A private CUDA GPU is required for DEBS model training.")
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quantization = None
    if args.method == "qlora":
        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
            bnb_4bit_use_double_quant=True,
        )
    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        quantization_config=quantization,
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        device_map="auto",
    )
    if args.method == "qlora":
        model = prepare_model_for_kbit_training(model)
    model.config.use_cache = False
    lora = LoraConfig(
        r=int(config.get("lora_rank", 8)),
        lora_alpha=int(config.get("lora_alpha", 16)),
        lora_dropout=float(config.get("lora_dropout", 0.05)),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    files = {split: str(Path(args.dataset_dir) / f"{split}.jsonl") for split in ("train", "validation", "test")}
    dataset = load_dataset("json", data_files=files)
    max_length = min(2048, max(256, int(config.get("max_seq_length", 1024))))
    def tokenize(batch):
        texts = [
            "### User\\n" + prompt + "\\n\\n### Assistant\\n" + answer + tokenizer.eos_token
            for prompt, answer in zip(batch["input"], batch["target"])
        ]
        return tokenizer(texts, truncation=True, max_length=max_length)
    tokenized = dataset.map(tokenize, batched=True, remove_columns=dataset["train"].column_names)
    training_args = TrainingArguments(
        output_dir=str(output / "checkpoints"),
        num_train_epochs=max(1, min(5, int(config.get("epochs", 1)))),
        learning_rate=float(config.get("learning_rate", 0.0002)),
        per_device_train_batch_size=max(1, min(2, int(config.get("batch_size", 1)))),
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=max(1, min(32, int(config.get("gradient_accumulation_steps", 8)))),
        gradient_checkpointing=True,
        logging_steps=5,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        optim="paged_adamw_8bit" if args.method == "qlora" else "adamw_torch",
        report_to=[],
        save_total_limit=2,
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        data_collator=DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False),
    )
    train_result = trainer.train()
    validation_metrics = trainer.evaluate(tokenized["validation"], metric_key_prefix="validation")
    test_metrics = trainer.evaluate(tokenized["test"], metric_key_prefix="test")
    model.save_pretrained(output / "adapter")
    tokenizer.save_pretrained(output / "adapter")
    metrics = {
        "train": train_result.metrics,
        "validation": validation_metrics,
        "test": test_metrics,
        "gpu": torch.cuda.get_device_name(0),
        "method": args.method,
        "base_model": args.base_model,
    }
    (output / "metrics.json").write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
    print(json.dumps(metrics, default=str))

if __name__ == "__main__":
    main()
