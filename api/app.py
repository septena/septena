"""FastAPI app wiring. Instantiates the app, attaches CORS, warms the
exercise cache at startup, and mounts every section router.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import (
    air,
    caffeine,
    calendar,
    cannabis,
    chores,
    groceries,
    exercise,
    habits,
    health,
    meta,
    nutrition,
    sections,
    settings,
    supplements,
    weather,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    exercise.load_cache()
    yield


app = FastAPI(title="Setlist API", lifespan=lifespan)

# Local-only app; credentials not needed, so wildcard origins are fine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exercise has no prefix (its routes predate the prefixed pattern). Every
# other section router declares its own `/api/{section}` prefix.
app.include_router(exercise.router)
app.include_router(nutrition.router)
app.include_router(habits.router)
app.include_router(supplements.router)
app.include_router(cannabis.router)
app.include_router(caffeine.router)
app.include_router(health.router)
app.include_router(chores.router)
app.include_router(groceries.router)
app.include_router(weather.router)
app.include_router(calendar.router)
app.include_router(air.router)
app.include_router(settings.router)
app.include_router(sections.router)
# Meta endpoints (/api/config, /api/meta) cross every section's paths.
app.include_router(meta.router)

# Optional local-only extensions. When `api/routers/_local.py` is present
# it gets a chance to register additional routers; it's a no-op when absent.
try:
    from api.routers import _local as _local_plugin  # type: ignore[import-not-found]
    _local_plugin.register(app)
except ImportError:
    pass
