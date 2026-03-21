from __future__ import annotations

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings


def _build_engine():
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(settings.database_url, echo=False, connect_args=connect_args)


engine = _build_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _maybe_upgrade_schema(engine)
    _sync_sequences(engine)


def _sync_sequences(engine) -> None:
    """
    Reset PostgreSQL auto-increment sequences to match the actual max id in
    each table. This is a no-op on SQLite and safe to run on every startup —
    it prevents UniqueViolation errors when data was imported with explicit ids
    (e.g. migrated from SQLite) without advancing the sequence.

    Uses SQLModel's own metadata so table names are always correct regardless
    of how SQLModel names them internally.
    """
    if settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            pk_cols = [c for c in table.columns if c.primary_key and c.autoincrement is not False]
            if not pk_cols:
                continue
            col = pk_cols[0].name
            tbl = table.name
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{tbl}', '{col}'), "
                f"COALESCE((SELECT MAX({col}) FROM {tbl}), 1));"
            ))


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
        if names and "nyt_username" not in names:
            conn.exec_driver_sql("ALTER TABLE player ADD COLUMN nyt_username VARCHAR;")
