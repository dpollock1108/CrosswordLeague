from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine

from .config import settings


def _build_engine():
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(settings.database_url, echo=False, connect_args=connect_args)


engine = _build_engine()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    with Session(engine) as session:
        yield session

