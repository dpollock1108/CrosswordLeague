from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlayerCreate(BaseModel):
    name: str
    handle: Optional[str] = None
    email: Optional[str] = None
    nyt_username: Optional[str] = None


class PlayerPublic(PlayerCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PuzzleResultCreate(BaseModel):
    player_id: int
    puzzle_date: date
    seconds: int = Field(gt=0, description="Completion time in whole seconds")
    points_override: Optional[int] = Field(default=None, description="Override automatic points")
    note: Optional[str] = None
    source: Optional[str] = None

    @field_validator("points_override")
    @classmethod
    def _validate_points(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value < 0:
            raise ValueError("points_override must be positive")
        return value


class PuzzleResultPublic(PuzzleResultCreate):
    id: int
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BulkPuzzleResultCreate(BaseModel):
    results: List[PuzzleResultCreate]
    overwrite_existing: bool = False


class CSVImportSummary(BaseModel):
    imported: int
    skipped: int
    errors: List[str] = Field(default_factory=list)


class LeaderboardEntry(BaseModel):
    player_id: int
    name: str
    handle: Optional[str]
    total_points: int
    puzzles_played: int
    average_seconds: Optional[float]
    best_seconds: Optional[int]


class LeaderboardResponse(BaseModel):
    start_date: date
    end_date: date
    points_table: List[int]
    entries: List[LeaderboardEntry]


class PlayerStats(BaseModel):
    player: PlayerPublic
    puzzles_played: int
    average_seconds: Optional[float]
    best_seconds: Optional[int]
    last_puzzle_date: Optional[date]
    total_points: int
    best_day_of_week: Optional[str] = Field(default=None, description="Weekday with best average time")
    weekday_averages: Optional[dict[str, float]] = Field(
        default=None,
        description="Average seconds per weekday name",
    )


class HealthResponse(BaseModel):
    status: str
