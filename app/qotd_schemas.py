"""Request/response schemas for the daily question (QOTD)."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Every question is multiple choice with exactly this many options — a fixed
# shape keeps scoring, the UI, and the verifier prompt simple.
QUESTION_CHOICE_COUNT = 4


class QuestionSubmit(BaseModel):
    prompt: str = Field(min_length=10, max_length=400)
    choices: List[str] = Field(min_length=QUESTION_CHOICE_COUNT, max_length=QUESTION_CHOICE_COUNT)
    answer_index: int = Field(ge=0, le=QUESTION_CHOICE_COUNT - 1)
    explanation: Optional[str] = Field(default=None, max_length=600)
    category: Optional[str] = Field(default=None, max_length=40)
    difficulty: Optional[str] = Field(default=None, pattern="^(easy|medium|hard)$")
    source_url: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _validate_choices(self) -> "QuestionSubmit":
        cleaned = [c.strip() for c in self.choices]
        if any(not c for c in cleaned):
            raise ValueError("All answer choices must be filled in.")
        if len({c.lower() for c in cleaned}) != len(cleaned):
            raise ValueError("Answer choices must be distinct.")
        self.choices = cleaned
        self.prompt = self.prompt.strip()
        return self


class VerificationPublic(BaseModel):
    """What the AI fact-checker concluded about a submission."""

    verdict: Optional[str] = None  # "approve" | "needs_review" | "reject"
    confidence: Optional[int] = None
    notes: Optional[str] = None
    verified_at: Optional[datetime] = None


class SubmissionPublic(BaseModel):
    """A question as its submitter sees it — answers included, it's theirs."""

    id: int
    prompt: str
    choices: List[str]
    answer_index: int
    explanation: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    source_url: Optional[str] = None
    status: str
    question_date: Optional[date] = None
    verification: VerificationPublic
    created_at: datetime


class SubmissionResult(BaseModel):
    submission: SubmissionPublic
    # Plain-language outcome for the submitter, e.g. "Approved — it's in the
    # question bank" or "Sent to a human reviewer".
    message: str


class QuestionPublic(BaseModel):
    """Today's question as a player sees it — no answer key."""

    id: int
    prompt: str
    choices: List[str]
    category: Optional[str] = None
    difficulty: Optional[str] = None
    question_date: date
    submitted_by_handle: Optional[str] = None


class AnswerPublic(BaseModel):
    question_id: int
    question_date: date
    started_at: datetime
    answered_at: Optional[datetime] = None
    seconds: Optional[int] = None
    selected_index: Optional[int] = None
    is_correct: Optional[bool] = None
    points: int = 0

    model_config = ConfigDict(from_attributes=True)


class TodayResponse(BaseModel):
    question: Optional[QuestionPublic] = None
    attempt: Optional[AnswerPublic] = None
    # Answer key, revealed only once the player has answered (or can no longer).
    answer_index: Optional[int] = None
    explanation: Optional[str] = None
    streak: int = 0


class AnswerSubmit(BaseModel):
    selected_index: int = Field(ge=0, le=QUESTION_CHOICE_COUNT - 1)


class AnswerResult(BaseModel):
    is_correct: bool
    answer_index: int
    selected_index: int
    seconds: int
    points: int
    streak: int
    explanation: Optional[str] = None


class DailyBoardEntry(BaseModel):
    user_id: int
    display_name: str
    handle: Optional[str] = None
    avatar_url: Optional[str] = None
    status: str  # "answered" | "playing" | "not_started"
    is_correct: Optional[bool] = None
    seconds: Optional[int] = None
    points: Optional[int] = None
    is_you: bool = False


class DailyBoardResponse(BaseModel):
    question_date: date
    scope: str  # "friends" or "league"
    league_id: Optional[int] = None
    # Others' results stay hidden until you've played — no scrolling to the
    # answer. False means `entries` only contains you.
    revealed: bool
    entries: List[DailyBoardEntry]


class QotdLeaderboardEntry(BaseModel):
    user_id: int
    display_name: str
    handle: Optional[str] = None
    avatar_url: Optional[str] = None
    total_points: int
    played: int
    correct: int
    accuracy: Optional[float] = None  # 0-100, null when nothing played
    average_seconds: Optional[float] = None
    best_seconds: Optional[int] = None
    current_streak: int = 0
    is_you: bool = False


class QotdLeaderboardResponse(BaseModel):
    start_date: date
    end_date: date
    scope: str
    league_id: Optional[int] = None
    entries: List[QotdLeaderboardEntry]


class QotdStats(BaseModel):
    played: int
    correct: int
    accuracy: Optional[float] = None
    average_seconds: Optional[float] = None
    best_seconds: Optional[int] = None
    total_points: int
    current_streak: int
    longest_streak: int
    submitted: int
    submissions_live: int


class QuestionAdminPublic(SubmissionPublic):
    """Review-queue view: adds who sent it in."""

    submitted_by: Optional[int] = None
    submitted_by_handle: Optional[str] = None


class QuestionSchedule(BaseModel):
    question_date: date


class QuestionReview(BaseModel):
    # Admin override of the AI verdict.
    approve: bool
    notes: Optional[str] = Field(default=None, max_length=600)
