"""Backend entrypoint — `uvicorn main:app --port 4445`.

The real code lives in the `api/` package. This module exists only so the
long-standing `main:app` invocation keeps working without a CLI flag change.
"""
from api.app import app

__all__ = ["app"]
