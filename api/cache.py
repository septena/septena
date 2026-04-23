"""Parsed-file cache shared by routers.

Filesystem-backed sections re-read + re-parse every event file on each
request. That's fine at tens of files but gets expensive at thousands
(chores history, long-lived nutrition logs, etc). This module memoises
parser output keyed by (path, mtime_ns): stale files get re-parsed,
unchanged files hit the cache.

Usage:

    from api.cache import parse_dir_cached

    entries = parse_dir_cached(NUTRITION_DIR, "*.md", _parse_nutrition_entry)

The parser takes a Path and returns a dict (or None to skip). Results
are returned in filename-sorted order; callers re-sort as needed.

Entries are auto-evicted on directory drift — files that disappear are
dropped on the next call. Explicit invalidation isn't needed because
writes bump the file's mtime and the next read re-parses that file.
"""
from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, List, Optional, Tuple

# Per-directory cache: { dir_str: { path_str: (mtime_ns, parsed_dict_or_None) } }
_caches: Dict[str, Dict[str, Tuple[int, Optional[Dict[str, Any]]]]] = {}
_lock = Lock()


def parse_dir_cached(
    directory: Path,
    glob: str,
    parser: Callable[[Path], Optional[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Return parsed, non-None entries for every file matching `glob`
    under `directory`. Unchanged files are served from the memo.
    """
    if not directory.exists():
        return []

    paths = sorted(directory.glob(glob))
    key = str(directory.resolve())

    with _lock:
        bucket = _caches.setdefault(key, {})
        # Drop entries for files that no longer exist.
        live = {str(p) for p in paths}
        for stale in [k for k in bucket if k not in live]:
            bucket.pop(stale, None)

    out: List[Dict[str, Any]] = []
    for path in paths:
        try:
            mtime_ns = path.stat().st_mtime_ns
        except OSError:
            continue
        path_key = str(path)
        cached = bucket.get(path_key)
        if cached is not None and cached[0] == mtime_ns:
            parsed = cached[1]
        else:
            parsed = parser(path)
            with _lock:
                bucket[path_key] = (mtime_ns, parsed)
        if parsed is not None:
            out.append(parsed)
    return out


def invalidate(directory: Path) -> None:
    """Drop the memo for a directory. Rarely needed — mtime drift
    handles it — but useful in tests."""
    key = str(directory.resolve())
    with _lock:
        _caches.pop(key, None)
