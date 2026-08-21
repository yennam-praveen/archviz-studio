from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, projects
from .config import settings
from .db import Base, engine

app = FastAPI(title="ArchViz Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def init_db() -> None:
    # Phase 1: create tables directly. Swap for Alembic migrations before production.
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(projects.router)
