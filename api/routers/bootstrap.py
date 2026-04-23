"""First-install bootstrap — copies selected example sections into the
user's data folder so the app lights up without shell gymnastics.

Called by the onboarding UI when the data folder is missing or empty.
Idempotent: skips section folders that already exist on disk.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.paths import DATA_ROOT
from api.section_manifest import folder_backed_sections

router = APIRouter(tags=["bootstrap"])

# Project-root `examples/data/` — the source tree the endpoint copies from.
EXAMPLES_ROOT = Path(__file__).resolve().parents[2] / "examples" / "data"

# Settings is always created alongside any picked section — the UI needs
# a settings.yaml to exist so `PUT /api/settings` works out of the box.
_ALWAYS_INCLUDE = {"Settings"}


class BootstrapRequest(BaseModel):
    sections: List[str]


class BootstrapResponse(BaseModel):
    created: List[str]
    skipped: List[str]
    data_dir: str


def _copy_section(folder_name: str) -> bool:
    """Copy `examples/data/{folder_name}/` into `$DATA_ROOT/{folder_name}/`.

    Returns True when the destination was newly created, False when it
    already existed (idempotent no-op). Falls back to creating an empty
    `Log/` subfolder when no example tree exists for the section.
    """
    dest = DATA_ROOT / folder_name
    if dest.exists():
        return False
    src = EXAMPLES_ROOT / folder_name
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        (dest / "Log").mkdir(parents=True, exist_ok=True)
    return True


@router.post("/api/bootstrap", response_model=BootstrapResponse)
def bootstrap(req: BootstrapRequest) -> Dict[str, Any]:
    key_to_folder = folder_backed_sections()
    allowed = set(key_to_folder)
    unknown = [s for s in req.sections if s not in allowed]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown section key(s): {', '.join(unknown)}",
        )

    DATA_ROOT.mkdir(parents=True, exist_ok=True)

    folders = {key_to_folder[s] for s in req.sections} | _ALWAYS_INCLUDE
    created: List[str] = []
    skipped: List[str] = []
    for folder_name in sorted(folders):
        if _copy_section(folder_name):
            created.append(folder_name)
        else:
            skipped.append(folder_name)

    return {
        "created": created,
        "skipped": skipped,
        "data_dir": str(DATA_ROOT),
    }
