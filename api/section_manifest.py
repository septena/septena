"""Shared section manifest loaded from the repo-level JSON file."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


@lru_cache(maxsize=1)
def load_section_manifest() -> Dict[str, Dict[str, Any]]:
    path = Path(__file__).resolve().parents[1] / "sections" / "manifest.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Section manifest must be a JSON object")
    out: Dict[str, Dict[str, Any]] = {}
    for key, value in raw.items():
        if not isinstance(value, dict):
            raise ValueError(f"Section manifest entry {key!r} must be an object")
        out[key] = value
    return out


def immutable_section_wiring() -> Dict[str, Dict[str, str]]:
    manifest = section_defaults()
    return {
        key: {
            "path": section["path"],
            "apiBase": section["apiBase"],
            "dataDir": section["dataDir"],
        }
        for key, section in manifest.items()
    }


def section_defaults() -> Dict[str, Dict[str, str]]:
    manifest = load_section_manifest()
    return {
        key: {
            "label": str(section.get("label") or key.capitalize()),
            "path": str(section.get("path") or ""),
            "apiBase": str(section.get("apiBase") or ""),
            "dataDir": str(section.get("dataDir") or ""),
            "color": str(section.get("color") or "hsl(0,0%,50%)"),
            "tagline": str(section.get("tagline") or ""),
            "emoji": str(section.get("emoji") or ""),
        }
        for key, section in manifest.items()
    }


def folder_backed_sections() -> Dict[str, str]:
    manifest = load_section_manifest()
    return {
        key: str(section["folderName"])
        for key, section in manifest.items()
        if section.get("folderName")
    }
