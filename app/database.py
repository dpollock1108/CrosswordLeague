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
        # Identifiers must be quoted. "user" is a reserved word in Postgres, so
        # an unquoted `FROM user` parses as the CURRENT_USER keyword rather than
        # the table and the statement fails. Let the dialect's preparer decide
        # what needs quoting instead of guessing.
        preparer = conn.dialect.identifier_preparer
        for table in SQLModel.metadata.sorted_tables:
            pk_cols = [c for c in table.columns if c.primary_key and c.autoincrement is not False]
            if not pk_cols:
                continue
            col = pk_cols[0].name
            tbl = table.name
            quoted_tbl = preparer.format_table(table)
            quoted_col = preparer.quote(col)
            # Table and column go to pg_get_serial_sequence as bound string
            # values, so they can never be interpolated into the statement.
            conn.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence(:tbl, :col), "
                    f"COALESCE((SELECT MAX({quoted_col}) FROM {quoted_tbl}), 1));"
                ),
                {"tbl": tbl, "col": col},
            )


def get_session() -> Session:
    with Session(engine) as session:
        yield session
