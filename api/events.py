"""Universal event contract.

Each section's router computes a list of `SectionEvent` for a given day.
The timeline (and any future cross-section views) consumes this contract
instead of knowing each section's native YAML shape.

On-disk YAML is unchanged — routers derive events from their existing
loaders. Untimed events use `time=None` and render in a daily strip.
"""
from __future__ import annotations

from typing import Optional, TypedDict


class SectionEvent(TypedDict, total=False):
    section: str            # "nutrition", "cannabis", etc.
    date: str               # YYYY-MM-DD
    time: Optional[str]     # "HH:MM" or None for all-day / untimed
    label: str              # primary display text
    sublabel: Optional[str] # optional secondary text (e.g. "v60", "83.5kg")
    icon: Optional[str]     # optional emoji/glyph override
    id: Optional[str]       # stable id for dedup + edit/delete wiring
