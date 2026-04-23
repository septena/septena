#!/usr/bin/env python3
"""Report and optionally remove a small set of proven-unused vault fields."""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.storage.frontmatter import FrontmatterMarkdownCodec
from api.storage.plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from api.storage.schemas import AIR_DAY_ALLOWED_FIELDS, SETTINGS_ALLOWED_TEMPLATE, list_unknown_paths


@dataclass
class CleanupFinding:
    path: Path
    fields: list[str]


def _collect_groceries(vault: Path) -> CleanupFinding | None:
    path = vault / "Groceries" / "groceries.yaml"
    if not path.exists():
        return None
    document = read_yaml_document(path, default={"items": []})
    data = document.data if isinstance(document.data, dict) else {}
    items = data.get("items") or []
    for item in items:
        if isinstance(item, dict) and "bought" in item:
            return CleanupFinding(path=path, fields=["items[].bought"])
    return None


def _apply_groceries(vault: Path) -> bool:
    path = vault / "Groceries" / "groceries.yaml"
    if not path.exists():
        return False
    document = read_yaml_document(path, default={"items": []})
    data = document.data if isinstance(document.data, dict) else {}
    changed = False
    for item in data.get("items") or []:
        if isinstance(item, dict) and "bought" in item:
            item.pop("bought", None)
            changed = True
    if changed:
        write_yaml_document(path, document)
    return changed


def _collect_air(vault: Path) -> list[CleanupFinding]:
    codec = FrontmatterMarkdownCodec()
    findings: list[CleanupFinding] = []
    air_dir = vault / "Air" / "Log"
    if not air_dir.exists():
        return findings
    for path in sorted(air_dir.glob("*.md")):
        document = codec.read(path)
        unknown = sorted(set(document.frontmatter.keys()) - AIR_DAY_ALLOWED_FIELDS)
        if "reading_count" in unknown:
            findings.append(CleanupFinding(path=path, fields=["reading_count"]))
    return findings


def _apply_air(vault: Path) -> int:
    codec = FrontmatterMarkdownCodec()
    changed = 0
    air_dir = vault / "Air" / "Log"
    if not air_dir.exists():
        return changed
    for path in sorted(air_dir.glob("*.md")):
        document = codec.read(path)
        if "reading_count" in document.frontmatter:
            document.frontmatter.pop("reading_count", None)
            codec.write(path, document)
            changed += 1
    return changed


SAFE_SETTINGS_FIELDS = {
    "targets.eating_min_h",
    "targets.eating_max_h",
    "units.weight_min_kg",
    "units.weight_max_kg",
    "units.fat_min_pct",
    "units.fat_max_pct",
    "mini_stats",
}


def _collect_settings(vault: Path) -> CleanupFinding | None:
    path = vault / "Settings" / "settings.yaml"
    if not path.exists():
        return None
    document = read_yaml_document(path, default={})
    data = document.data if isinstance(document.data, dict) else {}
    unknown = [field for field in list_unknown_paths(data, SETTINGS_ALLOWED_TEMPLATE) if field in SAFE_SETTINGS_FIELDS]
    if unknown:
        return CleanupFinding(path=path, fields=sorted(set(unknown)))
    return None


def _apply_settings(vault: Path) -> bool:
    path = vault / "Settings" / "settings.yaml"
    if not path.exists():
        return False
    document = read_yaml_document(path, default={})
    data = document.data if isinstance(document.data, dict) else {}
    changed = False
    targets = data.get("targets")
    if isinstance(targets, dict):
        for key in ("eating_min_h", "eating_max_h"):
            if key in targets:
                targets.pop(key, None)
                changed = True
    units = data.get("units")
    if isinstance(units, dict):
        for key in ("weight_min_kg", "weight_max_kg", "fat_min_pct", "fat_max_pct"):
            if key in units:
                units.pop(key, None)
                changed = True
    if "mini_stats" in data:
        data.pop("mini_stats", None)
        changed = True
    if changed:
        write_yaml_document(path, document)
    return changed


def collect_findings(vault: Path) -> list[CleanupFinding]:
    findings: list[CleanupFinding] = []
    groceries = _collect_groceries(vault)
    if groceries:
        findings.append(groceries)
    findings.extend(_collect_air(vault))
    settings = _collect_settings(vault)
    if settings:
        findings.append(settings)
    return findings


def apply_cleanup(vault: Path) -> int:
    changed = 0
    changed += int(_apply_groceries(vault))
    changed += _apply_air(vault)
    changed += int(_apply_settings(vault))
    return changed


def _print_findings(findings: list[CleanupFinding]) -> None:
    for finding in findings:
        print(str(finding.path))
        for field in finding.fields:
            print(f"  - {field}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report or remove proven-unused fields from a Septena vault.")
    parser.add_argument("--vault", default=str(Path.home() / "Documents" / "septena-data"))
    parser.add_argument("--apply", action="store_true", help="Rewrite files instead of reporting only.")
    args = parser.parse_args(argv)

    vault = Path(args.vault).expanduser()
    findings = collect_findings(vault)
    if not args.apply:
        if findings:
            print(f"Dry run: {len(findings)} file(s) would change")
            _print_findings(findings)
        else:
            print("Dry run: no changes needed")
        return 0

    changed = apply_cleanup(vault)
    if changed:
        print(f"Applied cleanup to {changed} file(s)")
        updated = collect_findings(vault)
        if updated:
            print("Remaining findings:")
            _print_findings(updated)
            return 1
        return 0
    print("Applied cleanup to 0 file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
