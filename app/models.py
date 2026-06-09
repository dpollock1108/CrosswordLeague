from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    handle: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"unique": True})
    email: Optional[str] = Field(default=None)
    nyt_username: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"unique": True})
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    google_id: str = Field(index=True, sa_column_kwargs={"unique": True})
    email: str = Field(index=True, sa_column_kwargs={"unique": True})
    display_name: str = Field()
    handle: Optional[str] = Field(default=None, index=True, sa_column_kwargs={"unique": True})
    avatar_url: Optional[str] = Field(default=None)
    player_id: Optional[int] = Field(default=None, foreign_key="player.id", sa_column_kwargs={"unique": True})
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    last_login_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class Puzzle(SQLModel, table=True):
    __tablename__ = "puzzle"
    __table_args__ = (UniqueConstraint("puzzle_type", "puzzle_date", name="uix_puzzle_type_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    puzzle_type: str = Field(index=True)  # "mini_5x5" or "medium_10x10"
    puzzle_date: date = Field(index=True)
    size: int = Field()  # 5 or 10
    grid_data: str = Field(sa_column=Column(Text, nullable=False))  # JSON: 2D cell array
    clues_data: str = Field(sa_column=Column(Text, nullable=False))  # JSON: across/down clues
    title: Optional[str] = Field(default=None)
    difficulty: Optional[str] = Field(default=None)  # "easy", "medium", "hard"
    status: str = Field(default="draft", index=True)  # "draft" or "published"
    created_by: Optional[str] = Field(default=None)  # "ai", "manual", or user_id
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    published_at: Optional[datetime] = Field(default=None)


class SolveAttempt(SQLModel, table=True):
    __tablename__ = "solve_attempt"
    __table_args__ = (UniqueConstraint("user_id", "puzzle_id", name="uix_solve_user_puzzle"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, nullable=False)
    puzzle_id: int = Field(foreign_key="puzzle.id", index=True, nullable=False)
    started_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    completed_at: Optional[datetime] = Field(default=None)
    seconds: Optional[int] = Field(default=None)
    grid_state: Optional[str] = Field(default=None, sa_column=Column(Text))  # JSON: current grid
    is_complete: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class League(SQLModel, table=True):
    __tablename__ = "league"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    invite_code: str = Field(index=True, sa_column_kwargs={"unique": True})
    creator_id: int = Field(foreign_key="user.id", nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class LeagueMembership(SQLModel, table=True):
    __tablename__ = "league_membership"
    __table_args__ = (UniqueConstraint("league_id", "user_id", name="uix_league_user"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    league_id: int = Field(foreign_key="league.id", index=True, nullable=False)
    user_id: int = Field(foreign_key="user.id", index=True, nullable=False)
    role: str = Field(default="member")  # "member" or "admin"
    joined_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class PuzzleResult(SQLModel, table=True):
    __tablename__ = "puzzle_results"
    __table_args__ = (UniqueConstraint("player_id", "puzzle_date", "puzzle_type", name="uix_result_player_date_type"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key="player.id", index=True, nullable=False)
    puzzle_date: date = Field(index=True, nullable=False)
    puzzle_type: str = Field(default="nyt_mini", index=True)
    seconds: int = Field(nullable=False, gt=0, description="Finish time in seconds")
    points_override: Optional[int] = Field(default=None, description="Manual score for the puzzle")
    note: Optional[str] = Field(default=None)
    source: Optional[str] = Field(default=None, description="Import source identifier")
    recorded_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
