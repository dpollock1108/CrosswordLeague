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
    puzzle_type: str = Field(default="nyt_mini", description="Puzzle type identifier")
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


class GoogleAuthRequest(BaseModel):
    id_token: str


class UserPublic(BaseModel):
    id: int
    email: str
    display_name: str
    handle: Optional[str] = None
    avatar_url: Optional[str] = None
    player_id: Optional[int] = None
    is_admin: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    handle: Optional[str] = Field(default=None, min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_]+$")


class AuthResponse(BaseModel):
    access_token: str
    user: UserPublic


# ---------------------------------------------------------------------------
# Puzzle schemas
# ---------------------------------------------------------------------------


class PuzzlePublic(BaseModel):
    """Puzzle data sent to clients — NO answers included."""
    id: int
    puzzle_type: str
    puzzle_date: date
    size: int
    grid_data: str  # JSON with letters stripped — only black/white cell info
    clues_data: str  # JSON with answers stripped
    title: Optional[str] = None
    difficulty: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PuzzleAdminPublic(BaseModel):
    """Full puzzle data including answers — admin only."""
    id: int
    puzzle_type: str
    puzzle_date: date
    size: int
    grid_data: str
    clues_data: str
    title: Optional[str] = None
    difficulty: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PuzzleCreate(BaseModel):
    puzzle_type: str
    puzzle_date: date
    size: int
    grid_data: str
    clues_data: str
    title: Optional[str] = None
    difficulty: Optional[str] = None


class PuzzleGenerateRequest(BaseModel):
    puzzle_type: str = "mini_5x5"
    puzzle_date: date
    difficulty: str = "medium"


class SolveAttemptPublic(BaseModel):
    id: int
    puzzle_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    seconds: Optional[int] = None
    grid_state: Optional[str] = None
    is_complete: bool

    model_config = ConfigDict(from_attributes=True)


class GridSubmission(BaseModel):
    grid_state: str  # JSON of user's filled grid


class SubmitResult(BaseModel):
    correct: bool
    seconds: Optional[int] = None
    points: Optional[int] = None
    errors: Optional[List[dict]] = None  # [{row, col}, ...] if incorrect


class PuzzleTodayResponse(BaseModel):
    puzzle: PuzzlePublic
    attempt: Optional[SolveAttemptPublic] = None


class HealthResponse(BaseModel):
    status: str


class DelinquentPlayer(BaseModel):
    player_id: int
    name: str
    handle: Optional[str]
    missing_dates: List[date]
    missing_count: int


class WallOfShameResponse(BaseModel):
    start_date: date
    end_date: date
    scope: str
    entries: List[DelinquentPlayer]


# ---------------------------------------------------------------------------
# League schemas
# ---------------------------------------------------------------------------


class LeagueCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    visibility: str = Field(default="private", pattern="^(public|private)$")


class LeagueUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=60)
    visibility: Optional[str] = Field(default=None, pattern="^(public|private)$")


class LeagueJoin(BaseModel):
    invite_code: str = Field(min_length=4, max_length=16)


class LeagueMemberPublic(BaseModel):
    user_id: int
    display_name: str
    handle: Optional[str] = None
    player_id: Optional[int] = None
    role: str
    status: str = "active"
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeaguePublic(BaseModel):
    id: int
    name: str
    invite_code: str
    creator_id: int
    visibility: str
    member_count: int
    role: Optional[str] = None  # current user's role in this league
    membership_status: Optional[str] = None  # "active" or "pending" for current user
    created_at: datetime


class LeagueJoinResult(BaseModel):
    league: LeaguePublic
    status: str  # "active" (joined) or "pending" (awaiting approval)


class LeagueDetail(LeaguePublic):
    members: List[LeagueMemberPublic]
    pending_requests: List[LeagueMemberPublic] = []  # populated for admins only


class ScoringTier(BaseModel):
    # Finish in <= max_seconds to earn `points`. null = catch-all (anyone slower).
    max_seconds: Optional[int] = Field(default=None, ge=1, le=86400)
    points: int = Field(ge=0, le=1000)


class CategoryScoring(BaseModel):
    tiers: List[ScoringTier] = Field(min_length=1, max_length=20)
    bonus: int = Field(default=1, ge=0, le=1000)  # first-place daily bonus


class LeagueScoringConfigPublic(BaseModel):
    mini: CategoryScoring
    medium: CategoryScoring


class LeagueScoringConfigUpdate(BaseModel):
    mini: CategoryScoring
    medium: CategoryScoring


class ParsedLeaderboardEntry(BaseModel):
    nyt_username: str
    time_str: str
    seconds: int
    player_id: Optional[int] = None
    player_name: Optional[str] = None
    matched: bool


class ScreenshotParseResponse(BaseModel):
    puzzle_date: date
    parsed: List[ParsedLeaderboardEntry]
    matched_count: int
    unmatched_count: int
