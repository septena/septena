#!/usr/bin/env python3
"""One-shot migration: flatten nested daily logs into one file per event.

Converts 4 sections from `Bases/<Section>/Log/YYYY-MM-DD.md` (with nested
`entries[]` / `completed[]` / `taken[]` arrays) into one file per event:
`Bases/<Section>/Log/YYYY-MM-DD--{slug}--NN.md`.

Every event file uses the universal schema (flat, no nested arrays):

    date:    required, YYYY-MM-DD
    id:      required, stable unique per event
    section: required, which collection the event belongs to
    time:    optional, HH:MM (only for events with a moment)
    # + section-specific flat fields

Old daily files are renamed to `.old` (not deleted) so the whole thing is
reversible until you manually clean up.

Usage:
    python3 scripts/flatten_daily_logs.py            # dry run — shows plan
    python3 scripts/flatten_daily_logs.py --apply    # actually do it
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import yaml

BASES = Path.home() / "Documents/septena-data"

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*", re.DOTALL)
DATE_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")


# ── Shared helpers ─────────────────────────────────────────────────────────

def read_frontmatter(path: Path) -> Dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return {}
    data = yaml.safe_load(m.group(1)) or {}
    return data if isinstance(data, dict) else {}


def write_event(path: Path, fm: Dict[str, Any]) -> None:
    body = "---\n" + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True) + "---\n"
    path.write_text(body, encoding="utf-8")


def load_config(config_path: Path, key: str) -> List[Dict[str, Any]]:
    """Read a <name>-config.yaml file and return data[key] as a list of dicts."""
    if not config_path.exists():
        return []
    try:
        data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        print(f"  ! failed to parse {config_path.name}: {exc}", file=sys.stderr)
        return []
    items = data.get(key) or []
    return [i for i in items if isinstance(i, dict)]


def iter_daily_files(log_dir: Path):
    """Yield old-format `YYYY-MM-DD.md` files. Skips `.old` backups and
    already-migrated per-event files (which contain `--` in the name)."""
    if not log_dir.exists():
        return
    for p in sorted(log_dir.glob("*.md")):
        if DATE_FILE_RE.match(p.name):
            yield p


# ── Habits ─────────────────────────────────────────────────────────────────

def migrate_habits(apply: bool) -> Tuple[int, int]:
    section_dir = BASES / "Habits"
    log_dir = section_dir / "Log"
    config = load_config(section_dir / "habits-config.yaml", "habits")
    config_by_id = {str(h.get("id", "")): h for h in config}

    files_in, events_out = 0, 0
    print(f"\n── Habits ({log_dir}) ──")
    for src in iter_daily_files(log_dir):
        files_in += 1
        fm = read_frontmatter(src)
        day = str(fm.get("date", src.stem))
        completed = fm.get("completed") or []
        notes = fm.get("notes") or {}
        if not isinstance(completed, list):
            completed = []
        if not isinstance(notes, dict):
            notes = {}
        for hid in completed:
            hid = str(hid).strip()
            if not hid:
                continue
            cfg = config_by_id.get(hid, {})
            event = {
                "date": day,
                "id": f"habit-{day}-{hid}",
                "section": "habits",
                "habit_id": hid,
                "habit_name": str(cfg.get("name", hid)),
                "bucket": str(cfg.get("bucket", "morning")),
                "note": (str(notes.get(hid, "")).strip() or None),
            }
            out = log_dir / f"{day}--{hid}--01.md"
            events_out += 1
            print(f"  {src.name:<16}  →  {out.name}")
            if apply:
                write_event(out, event)
        if apply:
            src.rename(src.with_suffix(".md.old"))
    print(f"  ⇒ {files_in} daily files → {events_out} event files")
    return files_in, events_out


# ── Supplements ────────────────────────────────────────────────────────────

def migrate_supplements(apply: bool) -> Tuple[int, int]:
    section_dir = BASES / "Supplements"
    log_dir = section_dir / "Log"
    config = load_config(section_dir / "supplements-config.yaml", "supplements")
    config_by_id = {str(s.get("id", "")): s for s in config}

    files_in, events_out = 0, 0
    print(f"\n── Supplements ({log_dir}) ──")
    for src in iter_daily_files(log_dir):
        files_in += 1
        fm = read_frontmatter(src)
        day = str(fm.get("date", src.stem))
        taken = fm.get("taken") or []
        notes = fm.get("notes") or {}
        if not isinstance(taken, list):
            taken = []
        if not isinstance(notes, dict):
            notes = {}
        for sid in taken:
            sid = str(sid).strip()
            if not sid:
                continue
            cfg = config_by_id.get(sid, {})
            event = {
                "date": day,
                "id": f"supplement-{day}-{sid}",
                "section": "supplements",
                "supplement_id": sid,
                "supplement_name": str(cfg.get("name", sid)),
                "emoji": str(cfg.get("emoji", "")) or None,
                "note": (str(notes.get(sid, "")).strip() or None),
            }
            out = log_dir / f"{day}--{sid}--01.md"
            events_out += 1
            print(f"  {src.name:<16}  →  {out.name}")
            if apply:
                write_event(out, event)
        if apply:
            src.rename(src.with_suffix(".md.old"))
    print(f"  ⇒ {files_in} daily files → {events_out} event files")
    return files_in, events_out


# ── Cannabis ───────────────────────────────────────────────────────────────

def _cannabis_grams_per_use() -> float:
    """Read current cannabis-config to compute capsule_g / uses_per_capsule.
    Used to snapshot grams into historical entries at migration time."""
    cfg_path = BASES / "Cannabis" / "cannabis-config.yaml"
    default_cap_g = 0.15
    default_uses = 3
    if not cfg_path.exists():
        return default_cap_g / default_uses
    try:
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return default_cap_g / default_uses
    cap_g = float(data.get("capsule_g") or default_cap_g)
    uses = float(data.get("uses_per_capsule") or default_uses)
    return cap_g / uses if uses > 0 else default_cap_g / default_uses


def migrate_cannabis(apply: bool) -> Tuple[int, int]:
    log_dir = BASES / "Cannabis" / "Log"
    per_use = _cannabis_grams_per_use()

    files_in, events_out = 0, 0
    print(f"\n── Cannabis ({log_dir}) ──")
    for src in iter_daily_files(log_dir):
        files_in += 1
        fm = read_frontmatter(src)
        day = str(fm.get("date", src.stem))
        entries = fm.get("entries") or []
        if not isinstance(entries, list):
            continue
        # Stable same-day numbering per method
        method_counters: Dict[str, int] = {}
        # Sort by time so NN reflects chronological order
        entries_sorted = sorted(
            (e for e in entries if isinstance(e, dict)),
            key=lambda e: str(e.get("time", "")),
        )
        for e in entries_sorted:
            method = str(e.get("method", "vape")).strip() or "vape"
            nn = method_counters.get(method, 0) + 1
            method_counters[method] = nn
            grams = round(per_use, 3) if method == "vape" else None
            strain = e.get("strain")
            if strain == "None" or strain == "none":
                strain = None
            event = {
                "date": day,
                "time": str(e.get("time", "")).strip() or None,
                "id": str(e.get("id") or f"cannabis-{day}-{method}-{nn:02d}"),
                "section": "cannabis",
                "method": method,
                "strain": strain,
                "grams": grams,
                "capsule_id": e.get("capsule_id"),
                "effect": e.get("effect"),
                "note": e.get("notes") or e.get("note"),
                "created_at": e.get("created_at"),
            }
            out = log_dir / f"{day}--{method}--{nn:02d}.md"
            events_out += 1
            print(f"  {src.name:<16}  →  {out.name}")
            if apply:
                write_event(out, event)
        if apply:
            src.rename(src.with_suffix(".md.old"))
    print(f"  ⇒ {files_in} daily files → {events_out} event files (grams/use = {per_use:.4f})")
    return files_in, events_out


# ── Caffeine ───────────────────────────────────────────────────────────────

def migrate_caffeine(apply: bool) -> Tuple[int, int]:
    log_dir = BASES / "Caffeine" / "Log"
    files_in, events_out = 0, 0
    print(f"\n── Caffeine ({log_dir}) ──")
    for src in iter_daily_files(log_dir):
        files_in += 1
        fm = read_frontmatter(src)
        day = str(fm.get("date", src.stem))
        entries = fm.get("entries") or []
        if not isinstance(entries, list):
            continue
        method_counters: Dict[str, int] = {}
        entries_sorted = sorted(
            (e for e in entries if isinstance(e, dict)),
            key=lambda e: str(e.get("time", "")),
        )
        for e in entries_sorted:
            method = str(e.get("method", "v60")).strip() or "v60"
            nn = method_counters.get(method, 0) + 1
            method_counters[method] = nn
            beans = e.get("beans")
            if beans == "None" or beans == "none":
                beans = None
            event = {
                "date": day,
                "time": str(e.get("time", "")).strip() or None,
                "id": str(e.get("id") or f"caffeine-{day}-{method}-{nn:02d}"),
                "section": "caffeine",
                "method": method,
                "beans": beans,
                "grams": e.get("grams"),
                "note": e.get("notes") or e.get("note"),
                "created_at": e.get("created_at"),
            }
            out = log_dir / f"{day}--{method}--{nn:02d}.md"
            events_out += 1
            print(f"  {src.name:<16}  →  {out.name}")
            if apply:
                write_event(out, event)
        if apply:
            src.rename(src.with_suffix(".md.old"))
    print(f"  ⇒ {files_in} daily files → {events_out} event files")
    return files_in, events_out


# ── Entrypoint ─────────────────────────────────────────────────────────────

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true",
                   help="Actually write files (default: dry run)")
    args = p.parse_args()

    if not args.apply:
        print("DRY RUN — no files written. Re-run with --apply to execute.")

    totals = [
        migrate_habits(args.apply),
        migrate_supplements(args.apply),
        migrate_cannabis(args.apply),
        migrate_caffeine(args.apply),
    ]
    files_in = sum(t[0] for t in totals)
    events_out = sum(t[1] for t in totals)
    print(f"\nTotal: {files_in} daily files → {events_out} event files.")
    if args.apply:
        print("Old daily files renamed to *.md.old (kept for safety).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
