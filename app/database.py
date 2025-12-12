from __future__ import annotations

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings


def _build_engine():
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(settings.database_url, echo=False, connect_args=connect_args)


engine = _build_engine()


def init_db() -> None:
    _maybe_upgrade_schema(engine)
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    with Session(engine) as session:
        yield session


def _maybe_upgrade_schema(engine) -> None:
    """
    Lightweight schema tweak for SQLite to add nyt_username if missing.
    For production, use a proper migration tool; this keeps dev sqlite usable.
    """
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        columns = conn.exec_driver_sql("PRAGMA table_info(player);").fetchall()
        names = [col[1] for col in columns]
        if "nyt_username" not in names:
            conn.exec_driver_sql("ALTER TABLE player ADD COLUMN nyt_username VARCHAR;")
