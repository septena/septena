"""Plain YAML document codec with header-comment preservation."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from api.io import atomic_write_text


@dataclass
class PlainYamlDocument:
    data: Any
    header: str = ""


def _split_header(raw: str) -> tuple[str, str]:
    lines = raw.splitlines(keepends=True)
    header_lines: list[str] = []
    idx = 0
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith("#") or stripped in ("\n", "\r\n"):
            header_lines.append(line)
            idx += 1
            continue
        break
    return "".join(header_lines), "".join(lines[idx:])


def read_yaml_document(path: Path, default: Any) -> PlainYamlDocument:
    if not path.exists():
        return PlainYamlDocument(data=default, header="")
    raw = path.read_text(encoding="utf-8")
    header, _body = _split_header(raw)
    data = yaml.safe_load(raw) if raw.strip() else default
    if data is None:
        data = default
    return PlainYamlDocument(data=data, header=header)


def write_yaml_document(path: Path, document: PlainYamlDocument) -> None:
    header = document.header or ""
    if header and not header.endswith("\n"):
        header += "\n"
    body = yaml.safe_dump(
        document.data,
        sort_keys=False,
        allow_unicode=True,
    )
    atomic_write_text(path, f"{header}{body}")
