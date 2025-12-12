from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    handle: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"unique": True})
    email: Optional[str] = Field(default=None)
    nyt_username: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"unique": True})
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class PuzzleResult(SQLModel, table=True):
    __tablename__ = "puzzle_results"
    __table_args__ = (UniqueConstraint("player_id", "puzzle_date", name="uix_result_player_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key="player.id", index=True, nullable=False)
    puzzle_date: date = Field(index=True, nullable=False)
    seconds: int = Field(nullable=False, gt=0, description="Finish time in seconds")
    points_override: Optional[int] = Field(default=None, description="Manual score for the puzzle")
    note: Optional[str] = Field(default=None)
    source: Optional[str] = Field(default=None, description="Import source identifier")
    recorded_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
