from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from .. import qotd_service
from ..auth import get_current_user, require_admin_or_token
from ..database import get_session
from ..models import TriviaQuestion, User
from ..qotd_schemas import (
    AnswerPublic,
    AnswerResult,
    AnswerSubmit,
    DailyBoardResponse,
    QotdLeaderboardResponse,
    QotdStats,
    QuestionAdminPublic,
    QuestionReview,
    QuestionSchedule,
    QuestionSubmit,
    SubmissionPublic,
    SubmissionResult,
    TodayResponse,
    TracksResponse,
)
from ..qotd_service import QotdError
from ..qotd_tracks import DEFAULT_TRACK, track_slugs

router = APIRouter(prefix="/qotd", tags=["qotd"])


def _bad_request(exc: QotdError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _get_question(session: Session, question_id: int) -> TriviaQuestion:
    question = session.get(TriviaQuestion, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    return question


# ---------------------------------------------------------------------------
# Play
# ---------------------------------------------------------------------------


@router.get("/tracks", response_model=TracksResponse)
def tracks(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TracksResponse:
    """Every daily track with your state on it today, and its scoring tiers."""
    return qotd_service.list_tracks(session, user)


@router.get("/today", response_model=TodayResponse)
def today(
    track: str = Query(DEFAULT_TRACK, description=f"One of: {', '.join(track_slugs())}"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TodayResponse:
    """One track's question today (answer key withheld until you've answered)."""
    try:
        return qotd_service.get_today(session, user, track=track)
    except QotdError as exc:
        raise _bad_request(exc)


@router.post("/{question_id}/start", response_model=AnswerPublic, status_code=status.HTTP_201_CREATED)
def start(
    question_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AnswerPublic:
    """Start the clock. Idempotent — returns the existing attempt if any."""
    try:
        attempt = qotd_service.start_question(session, user, question_id)
    except QotdError as exc:
        raise _bad_request(exc)
    return AnswerPublic.model_validate(attempt)


@router.post("/{question_id}/answer", response_model=AnswerResult)
def answer(
    question_id: int,
    body: AnswerSubmit,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> AnswerResult:
    """Submit your one answer. Time is measured server-side from the reveal."""
    try:
        return qotd_service.answer_question(session, user, question_id, body.selected_index)
    except QotdError as exc:
        raise _bad_request(exc)


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------


@router.get("/board", response_model=DailyBoardResponse)
def board(
    scope: str = Query("friends", pattern="^(friends|league)$"),
    league_id: Optional[int] = Query(None),
    day: Optional[date] = Query(None, description="Defaults to today"),
    track: str = Query(DEFAULT_TRACK, description=f"One of: {', '.join(track_slugs())}"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DailyBoardResponse:
    """One track's results today for your friends or a league."""
    try:
        return qotd_service.daily_board(
            session, user, scope=scope, league_id=league_id, day=day, track=track
        )
    except QotdError as exc:
        raise _bad_request(exc)


@router.get("/leaderboard", response_model=QotdLeaderboardResponse)
def leaderboard(
    scope: str = Query("friends", pattern="^(friends|league)$"),
    league_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    track: Optional[str] = Query(None, description="Omit to combine every track"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> QotdLeaderboardResponse:
    """Points table for a date window (defaults to the current Sun–Sat week)."""
    try:
        return qotd_service.leaderboard(
            session,
            user,
            scope=scope,
            league_id=league_id,
            start=start_date,
            end=end_date,
            track=track,
        )
    except QotdError as exc:
        raise _bad_request(exc)


@router.get("/stats", response_model=QotdStats)
def stats(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> QotdStats:
    return qotd_service.user_stats(session, user)


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


@router.post("/questions", response_model=SubmissionResult, status_code=status.HTTP_201_CREATED)
def submit(
    body: QuestionSubmit,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SubmissionResult:
    """Submit a question. It is AI fact-checked before it can ever go live."""
    question, message = qotd_service.submit_question(session, user, body)
    return SubmissionResult(
        submission=qotd_service.to_submission_public(question),
        message=message,
    )


@router.get("/questions/mine", response_model=List[SubmissionPublic])
def my_submissions(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> List[SubmissionPublic]:
    return qotd_service.list_submissions(session, user)


# ---------------------------------------------------------------------------
# Admin: review queue and scheduling
# ---------------------------------------------------------------------------


@router.get("/admin/questions", response_model=List[QuestionAdminPublic])
def admin_list(
    status_filter: Optional[str] = Query(
        None, alias="status", description="pending | approved | needs_review | rejected | scheduled"
    ),
    track: Optional[str] = Query(None, description="Filter to one track"),
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> List[QuestionAdminPublic]:
    return qotd_service.list_questions_admin(session, status_filter, track)


@router.post("/admin/questions/{question_id}/review", response_model=QuestionAdminPublic)
def admin_review(
    question_id: int,
    body: QuestionReview,
    session: Session = Depends(get_session),
    admin: User = Depends(get_current_user),
    _: None = Depends(require_admin_or_token),
) -> QuestionAdminPublic:
    """Override the AI verdict on a question in the review queue."""
    question = _get_question(session, question_id)
    try:
        question = qotd_service.review_question(session, question, admin, body.approve, body.notes)
    except QotdError as exc:
        raise _bad_request(exc)
    return qotd_service.to_admin_public(session, question)


@router.post("/admin/questions/{question_id}/reverify", response_model=QuestionAdminPublic)
def admin_reverify(
    question_id: int,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> QuestionAdminPublic:
    """Re-run the fact-checker (e.g. after a transient verifier failure)."""
    question = _get_question(session, question_id)
    try:
        question = qotd_service.reverify_question(session, question)
    except QotdError as exc:
        raise _bad_request(exc)
    return qotd_service.to_admin_public(session, question)


@router.post("/admin/questions/{question_id}/schedule", response_model=QuestionAdminPublic)
def admin_schedule(
    question_id: int,
    body: QuestionSchedule,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> QuestionAdminPublic:
    question = _get_question(session, question_id)
    try:
        question = qotd_service.schedule_question(session, question, body.question_date)
    except QotdError as exc:
        raise _bad_request(exc)
    return qotd_service.to_admin_public(session, question)


@router.post("/admin/questions/{question_id}/unschedule", response_model=QuestionAdminPublic)
def admin_unschedule(
    question_id: int,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> QuestionAdminPublic:
    question = _get_question(session, question_id)
    try:
        question = qotd_service.unschedule_question(session, question)
    except QotdError as exc:
        raise _bad_request(exc)
    return qotd_service.to_admin_public(session, question)


@router.delete("/admin/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(
    question_id: int,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> None:
    """Delete a question that has never been live."""
    question = _get_question(session, question_id)
    if question.question_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unschedule the question before deleting it.",
        )
    session.delete(question)
    session.commit()
