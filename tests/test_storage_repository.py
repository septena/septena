from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from api.storage.frontmatter import FrontmatterMarkdownCodec
from api.storage.repository import SectionRepository
from api.storage.schemas import (
    CaffeineEventSchema,
    GroceryEventSchema,
    HabitEventSchema,
    SupplementEventSchema,
)


class SectionRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.codec = FrontmatterMarkdownCodec()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _frontmatter_keys(self, path: Path) -> set[str]:
        document = self.codec.read(path)
        assert document is not None
        return set(document.frontmatter.keys())

    def test_habit_repository_roundtrip(self) -> None:
        repo = SectionRepository(self.root / "Habits" / "Log", HabitEventSchema())
        record = {
            "date": "2026-04-23",
            "id": "habit-2026-04-23-meditation",
            "section": "habits",
            "habit_id": "meditation",
            "habit_name": "Meditation",
            "bucket": "morning",
            "note": None,
            "time": "08:15",
        }
        path = repo.write(record)
        self.assertEqual(path.name, "2026-04-23--meditation--01.md")
        self.assertEqual(self._frontmatter_keys(path), HabitEventSchema().allowed_fields)
        self.assertEqual(len(repo.list()), 1)
        self.assertEqual(len(repo.list_day("2026-04-23")), 1)
        self.assertIsNotNone(repo.get_by_id("habit-2026-04-23-meditation", day="2026-04-23"))
        self.assertTrue(repo.delete("habit-2026-04-23-meditation", day="2026-04-23"))
        self.assertFalse(path.exists())

    def test_supplement_repository_roundtrip(self) -> None:
        repo = SectionRepository(self.root / "Supplements" / "Log", SupplementEventSchema())
        record = {
            "date": "2026-04-23",
            "id": "supplement-2026-04-23-omega3",
            "section": "supplements",
            "supplement_id": "omega3",
            "supplement_name": "Omega-3",
            "emoji": "🐟",
            "note": None,
            "time": "09:10",
        }
        path = repo.write(record)
        self.assertEqual(path.name, "2026-04-23--omega3--01.md")
        self.assertEqual(self._frontmatter_keys(path), SupplementEventSchema().allowed_fields)
        self.assertEqual(repo.get_by_id("supplement-2026-04-23-omega3")["supplement_id"], "omega3")
        self.assertTrue(repo.delete("supplement-2026-04-23-omega3"))
        self.assertFalse(path.exists())

    def test_caffeine_repository_sequences_files(self) -> None:
        repo = SectionRepository(self.root / "Caffeine" / "Log", CaffeineEventSchema())
        first = {
            "date": "2026-04-23",
            "time": "07:24",
            "id": "caf-1",
            "section": "caffeine",
            "method": "v60",
            "beans": "Wakuli",
            "grams": 8.0,
            "note": None,
            "created_at": "2026-04-23T07:24:35",
        }
        second = {
            **first,
            "id": "caf-2",
            "time": "11:00",
        }
        first_path = repo.write(first)
        second_path = repo.write(second)
        self.assertEqual(first_path.name, "2026-04-23--v60--01.md")
        self.assertEqual(second_path.name, "2026-04-23--v60--02.md")
        self.assertEqual(self._frontmatter_keys(first_path), CaffeineEventSchema().allowed_fields)
        self.assertEqual(repo.get_by_id("caf-2")["time"], "11:00")
        self.assertTrue(repo.delete("caf-1", day="2026-04-23"))
        self.assertFalse(first_path.exists())

    def test_grocery_event_repository_sequences_files(self) -> None:
        repo = SectionRepository(self.root / "Groceries" / "Log", GroceryEventSchema())
        first = {
            "date": "2026-04-23",
            "time": "10:00",
            "id": "grocery-1",
            "section": "groceries",
            "item_id": "eggs01",
            "item_name": "Eggs",
            "category": "dairy",
            "action": "needed",
        }
        second = {
            **first,
            "id": "grocery-2",
            "action": "bought",
            "time": "18:00",
        }
        first_path = repo.write(first)
        second_path = repo.write(second)
        self.assertEqual(first_path.name, "2026-04-23--eggs01--needed--01.md")
        self.assertEqual(second_path.name, "2026-04-23--eggs01--bought--01.md")
        self.assertEqual(self._frontmatter_keys(first_path), GroceryEventSchema().allowed_fields)
        self.assertEqual(len(repo.list_day("2026-04-23")), 2)
        self.assertTrue(repo.delete("grocery-2"))
        self.assertFalse(second_path.exists())
