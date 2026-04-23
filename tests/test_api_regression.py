from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml
from fastapi.testclient import TestClient

import api.app as api_app_module
import api.paths as paths
import api.routers.air as air_router
from api.storage.frontmatter import FrontmatterDocument, FrontmatterMarkdownCodec


class ApiRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name)
        self.today = __import__("datetime").date.today().isoformat()
        self._seed_vault()

        patches = {
            "DATA_ROOT": self.vault,
            "VAULT_ROOT": self.vault,
            "HABITS_DIR": self.vault / "Habits" / "Log",
            "HABITS_CONFIG_PATH": self.vault / "Habits" / "habits-config.yaml",
            "SUPPL_DIR": self.vault / "Supplements" / "Log",
            "SUPPL_CONFIG_PATH": self.vault / "Supplements" / "supplements-config.yaml",
            "CAFFEINE_DIR": self.vault / "Caffeine" / "Log",
            "CAFFEINE_CONFIG_PATH": self.vault / "Caffeine" / "caffeine-config.yaml",
            "GROCERIES_DIR": self.vault / "Groceries",
            "GROCERIES_PATH": self.vault / "Groceries" / "groceries.yaml",
            "GROCERIES_LOG_DIR": self.vault / "Groceries" / "Log",
            "SETTINGS_DIR": self.vault / "Settings",
            "SETTINGS_PATH": self.vault / "Settings" / "settings.yaml",
        }
        self.patchers = [patch.object(paths, key, value) for key, value in patches.items()]
        self.patchers.append(patch.object(air_router, "AIR_DIR", self.vault / "Air" / "Log"))
        self.patchers.append(patch.object(api_app_module.exercise, "load_cache", lambda: None))
        for patcher in self.patchers:
            patcher.start()
        self.client = TestClient(api_app_module.app)

    def tearDown(self) -> None:
        self.client.close()
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.tmp.cleanup()

    def _seed_vault(self) -> None:
        (self.vault / "Habits").mkdir(parents=True, exist_ok=True)
        (self.vault / "Habits" / "Log").mkdir(parents=True, exist_ok=True)
        (self.vault / "Supplements").mkdir(parents=True, exist_ok=True)
        (self.vault / "Supplements" / "Log").mkdir(parents=True, exist_ok=True)
        (self.vault / "Caffeine" / "Log").mkdir(parents=True, exist_ok=True)
        (self.vault / "Groceries" / "Log").mkdir(parents=True, exist_ok=True)
        (self.vault / "Settings").mkdir(parents=True, exist_ok=True)
        (self.vault / "Air" / "Log").mkdir(parents=True, exist_ok=True)

        (self.vault / "Habits" / "habits-config.yaml").write_text(
            yaml.safe_dump(
                {"habits": [{"id": "meditation", "name": "Meditation", "bucket": "morning"}]},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        (self.vault / "Supplements" / "supplements-config.yaml").write_text(
            yaml.safe_dump(
                {"supplements": [{"id": "omega3", "name": "Omega-3", "emoji": "🐟"}]},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        (self.vault / "Caffeine" / "caffeine-config.yaml").write_text(
            yaml.safe_dump({"beans": [{"id": "wakuli", "name": "Wakuli"}]}, sort_keys=False),
            encoding="utf-8",
        )
        (self.vault / "Groceries" / "groceries.yaml").write_text(
            yaml.safe_dump({"items": []}, sort_keys=False),
            encoding="utf-8",
        )
        (self.vault / "Settings" / "settings.yaml").write_text(
            yaml.safe_dump(
                {
                    "theme": "light",
                    "mini_stats": {},
                    "targets": {"eating_min_h": 8},
                    "units": {"weight": "kg", "distance": "km"},
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        FrontmatterMarkdownCodec().write(
            self.vault / "Air" / "Log" / f"{self.today}.md",
            FrontmatterDocument(
                frontmatter={
                    "date": self.today,
                    "section": "air",
                    "readings": [
                        {"time": "08:00", "co2_ppm": 900, "temp_c": 21.5, "humidity_pct": 48, "pressure_hpa": 1011.0},
                        {"time": "09:00", "co2_ppm": 950, "temp_c": 22.0, "humidity_pct": 50, "pressure_hpa": 1011.2},
                    ],
                },
                body="",
            ),
        )

    def test_habits_day_and_toggle(self) -> None:
        day = self.client.get(f"/api/habits/day/{self.today}").json()
        self.assertEqual(day["done_count"], 0)
        toggle = self.client.post("/api/habits/toggle", json={
            "date": self.today,
            "habit_id": "meditation",
            "done": True,
            "time": "08:15",
        })
        self.assertEqual(toggle.status_code, 200)
        day = self.client.get(f"/api/habits/day/{self.today}").json()
        self.assertTrue(day["grouped"]["morning"][0]["done"])
        self.assertEqual(day["grouped"]["morning"][0]["time"], "08:15")

    def test_supplements_day_and_toggle(self) -> None:
        toggle = self.client.post("/api/supplements/toggle", json={
            "date": self.today,
            "supplement_id": "omega3",
            "done": True,
            "time": "09:00",
        })
        self.assertEqual(toggle.status_code, 200)
        day = self.client.get(f"/api/supplements/day/{self.today}").json()
        self.assertTrue(day["items"][0]["done"])
        self.assertEqual(day["items"][0]["time"], "09:00")

    def test_caffeine_day_and_history(self) -> None:
        resp = self.client.post("/api/caffeine/entry", json={
            "date": self.today,
            "time": "07:24",
            "method": "v60",
            "beans": "Wakuli",
            "grams": 8,
        })
        self.assertEqual(resp.status_code, 200)
        day = self.client.get(f"/api/caffeine/day/{self.today}").json()
        self.assertEqual(day["session_count"], 1)
        self.assertEqual(day["total_g"], 8.0)
        history = self.client.get("/api/caffeine/history?days=1").json()
        self.assertEqual(history["daily"][0]["sessions"], 1)

    def test_groceries_list_and_history(self) -> None:
        added = self.client.post("/api/groceries/item", json={
            "name": "Eggs",
            "category": "dairy",
            "emoji": "🥚",
        }).json()
        item_id = added["id"]
        self.client.patch(f"/api/groceries/item/{item_id}", json={"low": True})
        self.client.patch(f"/api/groceries/item/{item_id}", json={"low": False})
        listing = self.client.get("/api/groceries").json()
        self.assertEqual(listing["items"][0]["last_bought"], self.today)
        history = self.client.get("/api/groceries/history?days=1").json()
        self.assertEqual(history["daily"][0]["needed"], 1)
        self.assertEqual(history["daily"][0]["bought"], 1)

    def test_air_day_and_history(self) -> None:
        day = self.client.get(f"/api/air/day/{self.today}").json()
        self.assertEqual(day["stats"]["readings"], 2)
        history = self.client.get("/api/air/history?days=1").json()
        self.assertEqual(history["daily"][0]["readings"], 2)

    def test_settings_get_and_put_drop_mini_stats_from_api(self) -> None:
        settings = self.client.get("/api/settings").json()
        self.assertNotIn("mini_stats", settings)
        self.assertNotIn("eating_min_h", settings["targets"])

        updated = self.client.put("/api/settings", json={"theme": "dark"}).json()
        self.assertEqual(updated["theme"], "dark")
        self.assertNotIn("mini_stats", updated)

        raw = yaml.safe_load((self.vault / "Settings" / "settings.yaml").read_text(encoding="utf-8"))
        self.assertIn("mini_stats", raw)

    def test_sections_use_manifest_defaults_and_folder_enablement(self) -> None:
        sections = self.client.get("/api/sections").json()
        by_key = {section["key"]: section for section in sections}

        self.assertEqual(by_key["habits"]["label"], "Habits")
        self.assertEqual(by_key["habits"]["color"], "hsl(220,60%,55%)")
        self.assertEqual(by_key["habits"]["emoji"], "✅")
        self.assertTrue(by_key["habits"]["enabled"])

        self.assertEqual(by_key["exercise"]["label"], "Exercise")
        self.assertEqual(by_key["exercise"]["path"], "/exercise")
        self.assertFalse(by_key["exercise"]["enabled"])
