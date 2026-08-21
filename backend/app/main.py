from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

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
    # Dev-only schema management: create tables and add columns introduced after the first run.
    # Swap for Alembic migrations before production.
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(projects)"))} if engine.dialect.name == "sqlite" else set()
        if engine.dialect.name == "sqlite" and "share_token" not in cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN share_token VARCHAR(64)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_projects_share_token ON projects (share_token)"))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(projects.shared_router)
