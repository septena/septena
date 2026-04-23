"""Filesystem write helpers.

Atomic writes: write to a sibling temp file, then os.replace() onto the
target path. On POSIX this is an atomic rename, so a crash mid-write
leaves either the old file intact or the new file complete — never a
half-written file in the vault.

Use `atomic_write_text` in place of `path.write_text(...)` for anything
that lives under `$SEPTENA_DATA_DIR`. Auxiliary caches (e.g. geocode,
Withings tokens) also benefit but aren't load-bearing.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Union


def atomic_write_text(path: Union[str, Path], content: str, encoding: str = "utf-8") -> None:
    """Write `content` to `path` atomically.

    The temp file is created in the same directory so os.replace() stays
    on the same filesystem (cross-fs rename would raise).
    """
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        prefix=f".{p.name}.",
        suffix=".tmp",
        dir=str(p.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding=encoding) as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_write_bytes(path: Union[str, Path], content: bytes) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        prefix=f".{p.name}.",
        suffix=".tmp",
        dir=str(p.parent),
    )
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, p)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
