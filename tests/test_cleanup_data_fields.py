from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

from api.storage.frontmatter import FrontmatterDocument, FrontmatterMarkdownCodec

ROOT = Path(__file__).resolve().parents[1]


class CleanupDataFieldsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name)
        (self.vault / "Groceries").mkdir(parents=True, exist_ok=True)
        (self.vault / "Air" / "Log").mkdir(parents=True, exist_ok=True)
        (self.vault / "Settings").mkdir(parents=True, exist_ok=True)

        (self.vault / "Groceries" / "groceries.yaml").write_text(
            yaml.safe_dump({
                "items": [
                    {
                        "id": "eggs01",
                        "name": "Eggs",
                        "category": "dairy",
                        "emoji": "🥚",
                        "low": False,
                        "bought": True,
                        "last_bought": "2026-04-21",
                    }
                ]
            }, sort_keys=False),
            encoding="utf-8",
        )
        codec = FrontmatterMarkdownCodec()
        codec.write(
            self.vault / "Air" / "Log" / "2026-04-23.md",
            FrontmatterDocument(
                frontmatter={
                    "date": "2026-04-23",
                    "section": "air",
                    "reading_count": 2,
                    "readings": [{"time": "08:00", "co2_ppm": 900}],
                },
                body="\nbody preserved\n",
            ),
        )
        (self.vault / "Settings" / "settings.yaml").write_text(
            yaml.safe_dump(
                {
                    "theme": "light",
                    "mini_stats": {},
                    "targets": {"eating_min_h": 8, "eating_max_h": 10},
                    "units": {
                        "weight": "kg",
                        "distance": "km",
                        "weight_min_kg": 83,
                        "weight_max_kg": 85,
                        "fat_min_pct": 12,
                        "fat_max_pct": 15,
                    },
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _run(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "scripts/cleanup_data_fields.py", "--data-dir", str(self.vault), *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_dry_run_reports_safe_fields(self) -> None:
        result = self._run()
        self.assertEqual(result.returncode, 0)
        self.assertIn("items[].bought", result.stdout)
        self.assertIn("reading_count", result.stdout)
        self.assertIn("mini_stats", result.stdout)
        self.assertIn("targets.eating_min_h", result.stdout)
        self.assertIn("units.weight_min_kg", result.stdout)

    def test_apply_rewrites_only_targeted_fields_and_is_idempotent(self) -> None:
        first = self._run("--apply")
        self.assertEqual(first.returncode, 0)
        self.assertIn("Applied cleanup to 3 file(s)", first.stdout)

        groceries = yaml.safe_load((self.vault / "Groceries" / "groceries.yaml").read_text(encoding="utf-8"))
        self.assertNotIn("bought", groceries["items"][0])
        self.assertEqual(groceries["items"][0]["last_bought"], "2026-04-21")

        air_doc = FrontmatterMarkdownCodec().read(self.vault / "Air" / "Log" / "2026-04-23.md")
        assert air_doc is not None
        self.assertNotIn("reading_count", air_doc.frontmatter)
        self.assertEqual(air_doc.body, "\nbody preserved\n")

        settings = yaml.safe_load((self.vault / "Settings" / "settings.yaml").read_text(encoding="utf-8"))
        self.assertNotIn("mini_stats", settings)
        self.assertNotIn("eating_min_h", settings["targets"])
        self.assertNotIn("weight_min_kg", settings["units"])

        second = self._run("--apply")
        self.assertEqual(second.returncode, 0)
        self.assertIn("Applied cleanup to 0 file(s)", second.stdout)
