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
    _sync_sequences(engine)


def _sync_sequences(engine) -> None:
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
