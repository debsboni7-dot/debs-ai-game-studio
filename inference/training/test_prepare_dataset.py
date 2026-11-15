import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("prepare_dataset.py")

class DatasetPreparationTests(unittest.TestCase):
    def run_prepare(self, rows):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        source = root / "source.jsonl"
        target = root / "prepared"
        source.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--input", str(source), "--output", str(target)],
            text=True, capture_output=True,
        )
        return temporary, result, target

    def valid_rows(self):
        return [
            {"input":"Explain variables","target":"A variable stores a value.","split":"train","pii_reviewed":True,"consent_confirmed":True},
            {"input":"Explain a function","target":"A function groups reusable instructions.","split":"validation","pii_reviewed":True,"consent_confirmed":True},
            {"input":"What is 2 + 2?","target":"4","split":"test","pii_reviewed":True,"consent_confirmed":True},
        ]

    def test_valid_dataset_is_split_and_hashed(self):
        temporary, result, target = self.run_prepare(self.valid_rows())
        try:
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads((target / "dataset-manifest.json").read_text())
            self.assertEqual(manifest["counts"], {"train":1,"validation":1,"test":1})
            self.assertTrue((target / "train.jsonl").exists())
            self.assertTrue((target / "validation.jsonl").exists())
            self.assertTrue((target / "test.jsonl").exists())
        finally:
            temporary.cleanup()

    def test_missing_partition_is_rejected(self):
        rows = self.valid_rows()[:2]
        temporary, result, _ = self.run_prepare(rows)
        try:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("partitions", result.stderr)
        finally:
            temporary.cleanup()

    def test_unreviewed_consent_is_rejected(self):
        rows = self.valid_rows()
        rows[0]["consent_confirmed"] = False
        temporary, result, _ = self.run_prepare(rows)
        try:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("consent", result.stderr.lower())
        finally:
            temporary.cleanup()

    def test_email_personal_data_is_rejected(self):
        rows = self.valid_rows()
        rows[0]["input"] = "Contact test.person@example.com"
        temporary, result, _ = self.run_prepare(rows)
        try:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("personal data", result.stderr)
        finally:
            temporary.cleanup()

if __name__ == "__main__":
    unittest.main()
