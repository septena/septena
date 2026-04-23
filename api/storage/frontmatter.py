"""Markdown frontmatter codec with body preservation."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any, Dict

import yaml

from api.io import atomic_write_text

FRONTMATTER_DOC_RE = re.compile(
    r"^---\s*\n(?P<frontmatter>.*?)\n---(?P<body>\n.*)?$",
    re.DOTALL,
)


@dataclass
class FrontmatterDocument:
    frontmatter: Dict[str, Any]
    body: str = ""


class FrontmatterMarkdownCodec:
    """Read and write `--- yaml ---` markdown documents."""

    def read(self, path: Path) -> FrontmatterDocument | None:
        raw = path.read_text(encoding="utf-8")
        match = FRONTMATTER_DOC_RE.match(raw)
        if not match:
            raise ValueError("No YAML frontmatter found")
        data = yaml.safe_load(match.group("frontmatter"))
        if not isinstance(data, dict):
            raise ValueError("Frontmatter did not parse to a mapping")
        body = match.group("body") or ""
        return FrontmatterDocument(frontmatter=data, body=body)

    def write(self, path: Path, document: FrontmatterDocument) -> None:
        fm = yaml.safe_dump(
            document.frontmatter,
            sort_keys=False,
            allow_unicode=True,
        )
        body = document.body or ""
        if body:
            content = f"---\n{fm}---{body}"
        else:
            content = f"---\n{fm}---\n"
        atomic_write_text(path, content)
