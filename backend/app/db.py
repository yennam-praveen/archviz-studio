from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

def _normalise(url: str) -> str:
    # Hosts like Render hand out `postgres://…`; SQLAlchemy 2 needs an explicit driver.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


database_url = _normalise(settings.database_url)
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
# pool_pre_ping: free-tier Postgres drops idle connections; re-check before reuse.
engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
