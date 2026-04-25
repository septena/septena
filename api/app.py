"""FastAPI app wiring. Instantiates the app, attaches CORS, warms the
training cache at startup, and mounts every section router.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import (
    air,
    bootstrap,
    caffeine,
    cannabis,
    chores,
    groceries,
    exercise,
    gut,
    habits,
    health,
    meta,
    nutrition,
    sections,
    settings,
    supplements,
    tasks,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    exercise.load_cache()
    yield


app = FastAPI(title="Septena API", lifespan=lifespan)

# Local-only app; credentials not needed, so wildcard origins are fine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Training keeps the legacy unprefixed aliases for compatibility; every
# other section router declares its own `/api/{section}` prefix.
app.include_router(exercise.router)
app.include_router(nutrition.router)
app.include_router(habits.router)
app.include_router(supplements.router)
app.include_router(cannabis.router)
app.include_router(caffeine.router)
app.include_router(health.router)
app.include_router(chores.router)
app.include_router(tasks.router)
app.include_router(groceries.router)
app.include_router(air.router)
app.include_router(gut.router)
app.include_router(settings.router)
app.include_router(sections.router)
# Meta endpoints (/api/config, /api/meta) cross every section's paths.
app.include_router(meta.router)
# First-install bootstrap — seeds data folder from examples/data/.
app.include_router(bootstrap.router)
