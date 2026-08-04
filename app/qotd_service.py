"""Question of the Day: submissions, the daily play loop, and boards.

One general-knowledge question goes live per day. Everyone gets a single shot
at it, timed from the moment the question is revealed to them, and is ranked on
whether they got it right and how fast they were.

Questions come from players. A submission is fact-checked by the AI verifier
(qotd_verify) before it can ever be scheduled; anything the verifier is not
confident about waits in an admin review queue.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from sqlmodel import Session, select

from . import friend_service, league_service, qotd_verify
from .models import TriviaAnswer, TriviaQuestion, User
from .qotd_schemas import (
    AnswerPublic,
    AnswerResult,
    DailyBoardEntry,
    DailyBoardResponse,
    QotdLeaderboardEntry,
    QotdLeaderboardResponse,
    QotdStats,
    QuestionAdminPublic,
    QuestionPublic,
    QuestionSubmit,
    SubmissionPublic,
    TodayResponse,
    TrackPublic,
    TrackStats,
    TracksResponse,
    VerificationPublic,
)
from .qotd_scoring import apply_daily_bonus, clamp_seconds, current_streak, personal_points
from .qotd_tracks import DEFAULT_TRACK, Track, all_tracks, get_track, is_track


class QotdError(Exception):
    """Raised for expected QOTD failures (mapped to 4xx)."""


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _choices(question: TriviaQuestion) -> List[str]:
    return list(json.loads(question.choices_data))


def _verification(question: TriviaQuestion) -> VerificationPublic:
    return VerificationPublic(
        verdict=question.verdict,
        confidence=question.verdict_confidence,
        notes=question.verdict_notes,
        verified_at=question.verified_at,
    )


def to_submission_public(question: TriviaQuestion) -> SubmissionPublic:
    return SubmissionPublic(
        id=question.id,
        track=question.track,
        prompt=question.prompt,
        choices=_choices(question),
        answer_index=question.answer_index,
        explanation=question.explanation,
        category=question.category,
        difficulty=question.difficulty,
        source_url=question.source_url,
        status=question.status,
        question_date=question.question_date,
        verification=_verification(question),
        created_at=question.created_at,
    )


def to_admin_public(session: Session, question: TriviaQuestion) -> QuestionAdminPublic:
    author = session.get(User, question.submitted_by) if question.submitted_by else None
    return QuestionAdminPublic(
        **to_submission_public(question).model_dump(),
        submitted_by=question.submitted_by,
        submitted_by_handle=(author.handle or author.display_name) if author else None,
    )


def to_question_public(session: Session, question: TriviaQuestion) -> QuestionPublic:
    author = session.get(User, question.submitted_by) if question.submitted_by else None
    return QuestionPublic(
        id=question.id,
        track=question.track,
        prompt=question.prompt,
        choices=_choices(question),
        category=question.category,
        difficulty=question.difficulty,
        question_date=question.question_date,
        submitted_by_handle=(author.handle or author.display_name) if author else None,
    )


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------

_STATUS_MESSAGES = {
    "approved": "Verified — your question is in the bank and can go live on an upcoming day.",
    "needs_review": "Thanks! The fact-checker wasn't sure, so a human will take a look before it ships.",
    "rejected": "The fact-checker couldn't confirm this one. See the notes below — you can submit a fixed version.",
}


def submit_question(session: Session, user: User, body: QuestionSubmit) -> Tuple[TriviaQuestion, str]:
    """Store a user-submitted question and run it through AI verification."""
    result = qotd_verify.verify_question(
        prompt=body.prompt,
        choices=body.choices,
        answer_index=body.answer_index,
        explanation=body.explanation,
        track=body.track,
    )

    status = {
        "approve": "approved",
        "reject": "rejected",
        "needs_review": "needs_review",
    }[result.verdict]

    question = TriviaQuestion(
        track=body.track,
        prompt=body.prompt,
        choices_data=json.dumps(body.choices),
        answer_index=body.answer_index,
        # Prefer the submitter's own explanation; fall back to the verifier's.
        explanation=body.explanation or result.explanation,
        category=body.category or result.category,
        difficulty=body.difficulty or result.difficulty,
        source_url=body.source_url,
        submitted_by=user.id,
        status=status,
        verdict=result.verdict,
        verdict_confidence=result.confidence,
        verdict_notes=result.notes,
        verified_at=datetime.utcnow(),
    )
    session.add(question)
    session.commit()
    session.refresh(question)
    return question, _STATUS_MESSAGES[status]


def reverify_question(session: Session, question: TriviaQuestion) -> TriviaQuestion:
    """Re-run the fact-checker (admin action, e.g. after a transient failure)."""
    if question.question_date is not None:
        raise QotdError("Unschedule the question before re-verifying it.")
    result = qotd_verify.verify_question(
        prompt=question.prompt,
        choices=_choices(question),
        answer_index=question.answer_index,
        explanation=question.explanation,
        track=question.track,
    )
    question.status = {"approve": "approved", "reject": "rejected", "needs_review": "needs_review"}[
        result.verdict
    ]
    question.verdict = result.verdict
    question.verdict_confidence = result.confidence
    question.verdict_notes = result.notes
    question.verified_at = datetime.utcnow()
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def review_question(
    session: Session, question: TriviaQuestion, admin: User, approve: bool, notes: Optional[str] = None
) -> TriviaQuestion:
    """Human override of the AI verdict."""
    if question.question_date is not None:
        raise QotdError("This question is already scheduled; unschedule it first.")
    question.status = "approved" if approve else "rejected"
    question.reviewed_by = admin.id
    who = admin.handle or admin.display_name
    stamp = f"Reviewed by @{who}: {'approved' if approve else 'rejected'}"
    question.verdict_notes = f"{stamp}. {notes}" if notes else stamp
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def list_submissions(session: Session, user: User) -> List[SubmissionPublic]:
    rows = session.exec(
        select(TriviaQuestion)
        .where(TriviaQuestion.submitted_by == user.id)
        .order_by(TriviaQuestion.created_at.desc())  # type: ignore[union-attr]
    ).all()
    return [to_submission_public(q) for q in rows]


def list_questions_admin(
    session: Session, status: Optional[str] = None, track: Optional[str] = None
) -> List[QuestionAdminPublic]:
    stmt = select(TriviaQuestion).order_by(TriviaQuestion.created_at.desc())  # type: ignore[union-attr]
    if status:
        stmt = stmt.where(TriviaQuestion.status == status)
    if track:
        stmt = stmt.where(TriviaQuestion.track == track)
    return [to_admin_public(session, q) for q in session.exec(stmt).all()]


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


def question_for_date(
    session: Session, day: date, track: str = DEFAULT_TRACK
) -> Optional[TriviaQuestion]:
    """The question live on ``day`` for one track. Tracks are independent."""
    return session.exec(
        select(TriviaQuestion).where(
            TriviaQuestion.question_date == day,
            TriviaQuestion.track == track,
        )
    ).first()


def schedule_question(session: Session, question: TriviaQuestion, day: date) -> TriviaQuestion:
    if question.status not in {"approved", "scheduled"}:
        raise QotdError("Only verified questions can be scheduled.")
    if day < date.today():
        raise QotdError("Questions can only be scheduled for today or a future date.")
    clash = question_for_date(session, day, question.track)
    if clash and clash.id != question.id:
        raise QotdError(
            f"Question #{clash.id} is already scheduled for {day} on the "
            f"{get_track(question.track).name} track."
        )

    question.question_date = day
    question.status = "scheduled"
    question.published_at = datetime.utcnow()
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def unschedule_question(session: Session, question: TriviaQuestion) -> TriviaQuestion:
    """Pull a question back into the bank. Only possible before it goes live."""
    if question.question_date is not None and question.question_date <= date.today():
        raise QotdError("That question is already live and can't be pulled.")
    question.question_date = None
    question.status = "approved"
    question.published_at = None
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def _auto_schedule(session: Session, day: date, track: str) -> Optional[TriviaQuestion]:
    """Promote the oldest verified question from that track's bank onto ``day``.

    Keeps the game running without a daily admin action: as long as a track has
    verified questions banked, it has a question of the day. A track with an
    empty bank simply has no question that day — it never borrows from another.
    """
    candidate = session.exec(
        select(TriviaQuestion)
        .where(
            TriviaQuestion.status == "approved",
            TriviaQuestion.track == track,
            TriviaQuestion.question_date.is_(None),  # type: ignore[union-attr]
        )
        .order_by(TriviaQuestion.created_at)  # type: ignore[arg-type]
    ).first()
    if not candidate:
        return None
    candidate.question_date = day
    candidate.status = "scheduled"
    candidate.published_at = datetime.utcnow()
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


def live_question(
    session: Session, day: Optional[date] = None, track: str = DEFAULT_TRACK
) -> Optional[TriviaQuestion]:
    """The question for ``day`` on ``track``, promoting one from the bank if needed."""
    day = day or date.today()
    existing = question_for_date(session, day, track)
    if existing:
        return existing
    if day != date.today():
        return None  # never backfill history
    return _auto_schedule(session, day, track)


# ---------------------------------------------------------------------------
# Play loop
# ---------------------------------------------------------------------------


def _answers_for_user(session: Session, user_id: int) -> List[TriviaAnswer]:
    return session.exec(
        select(TriviaAnswer).where(TriviaAnswer.user_id == user_id)
    ).all()


def get_answer(session: Session, user_id: int, question_id: int) -> Optional[TriviaAnswer]:
    return session.exec(
        select(TriviaAnswer).where(
            TriviaAnswer.user_id == user_id,
            TriviaAnswer.question_id == question_id,
        )
    ).first()


def get_today(
    session: Session, user: User, track: str = DEFAULT_TRACK, day: Optional[date] = None
) -> TodayResponse:
    """One track's question for the day, plus this user's attempt state.

    The answer key is withheld until the player has answered — the point of the
    game is one honest shot.
    """
    if not is_track(track):
        raise QotdError(f"Unknown track '{track}'.")
    day = day or date.today()
    question = live_question(session, day, track)
    if not question:
        return TodayResponse(track=track, streak=streak_for(session, user.id, day, track))

    attempt = get_answer(session, user.id, question.id)
    answered = bool(attempt and attempt.answered_at)

    return TodayResponse(
        track=track,
        question=to_question_public(session, question),
        attempt=AnswerPublic.model_validate(attempt) if attempt else None,
        answer_index=question.answer_index if answered else None,
        explanation=question.explanation if answered else None,
        streak=streak_for(session, user.id, day, track),
    )


def start_question(session: Session, user: User, question_id: int) -> TriviaAnswer:
    """Reveal the question and start this player's clock. Idempotent.

    The clock is server-side: ``started_at`` is stamped here and elapsed time is
    measured against it when the answer arrives, so the client can't shave
    seconds off.
    """
    question = session.get(TriviaQuestion, question_id)
    if not question or question.question_date is None:
        raise QotdError("Question not found.")
    if question.question_date != date.today():
        raise QotdError("Only today's question can be played.")

    existing = get_answer(session, user.id, question_id)
    if existing:
        return existing

    attempt = TriviaAnswer(
        user_id=user.id,
        question_id=question_id,
        track=question.track,
        question_date=question.question_date,
        started_at=datetime.utcnow(),
    )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return attempt


def answer_question(
    session: Session, user: User, question_id: int, selected_index: int
) -> AnswerResult:
    """Record the one and only answer for this player and score it."""
    question = session.get(TriviaQuestion, question_id)
    if not question or question.question_date is None:
        raise QotdError("Question not found.")
    if question.question_date != date.today():
        raise QotdError("Only today's question can be answered.")
    if not 0 <= selected_index < len(_choices(question)):
        raise QotdError("That answer choice doesn't exist.")

    attempt = get_answer(session, user.id, question_id)
    if not attempt:
        raise QotdError("You haven't started this question yet.")
    if attempt.answered_at is not None:
        raise QotdError("You've already answered today's question.")

    now = datetime.utcnow()
    seconds = clamp_seconds((now - attempt.started_at).total_seconds(), question.track)
    is_correct = selected_index == question.answer_index

    # The streak this answer extends: yesterday's run on this track, plus today
    # if correct. Streaks never cross tracks.
    prior = streak_for(
        session, user.id, question.question_date - timedelta(days=1), question.track
    )
    streak = prior + 1 if is_correct else 0

    attempt.answered_at = now
    attempt.seconds = seconds
    attempt.selected_index = selected_index
    attempt.is_correct = is_correct
    attempt.points = personal_points(is_correct, seconds, streak, question.track)
    session.add(attempt)
    session.commit()
    session.refresh(attempt)

    return AnswerResult(
        track=question.track,
        is_correct=is_correct,
        answer_index=question.answer_index,
        selected_index=selected_index,
        seconds=seconds,
        points=attempt.points,
        streak=streak,
        explanation=question.explanation,
    )


def streak_for(
    session: Session,
    user_id: int,
    through: Optional[date] = None,
    track: str = DEFAULT_TRACK,
) -> int:
    return current_streak(_answers_for_user(session, user_id), through or date.today(), track)


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------


def scope_user_ids(
    session: Session, user: User, scope: str, league_id: Optional[int] = None
) -> Set[int]:
    """The set of users a board covers, always including the viewer."""
    if scope == "friends":
        return friend_service.friend_ids(session, user.id) | {user.id}
    if scope == "league":
        if league_id is None:
            raise QotdError("A league id is required for league scope.")
        if not league_service.is_active_member(session, league_id, user.id):
            raise QotdError("You are not a member of that league.")
        return league_service.league_member_user_ids(session, league_id) | {user.id}
    raise QotdError(f"Unknown scope '{scope}'.")


def _answers_in_range(
    session: Session,
    user_ids: Iterable[int],
    start: date,
    end: date,
    track: Optional[str] = None,
) -> List[TriviaAnswer]:
    """Answers in a date window. ``track=None`` spans every track."""
    ids = list(user_ids)
    if not ids:
        return []
    stmt = select(TriviaAnswer).where(
        TriviaAnswer.user_id.in_(ids),  # type: ignore[union-attr]
        TriviaAnswer.question_date >= start,
        TriviaAnswer.question_date <= end,
    )
    if track is not None:
        stmt = stmt.where(TriviaAnswer.track == track)
    return session.exec(stmt).all()


def daily_board(
    session: Session,
    user: User,
    scope: str = "friends",
    league_id: Optional[int] = None,
    day: Optional[date] = None,
    track: str = DEFAULT_TRACK,
) -> DailyBoardResponse:
    """Who in your scope has played today, how fast, and whether they got it.

    One board per track. Results stay hidden until you have answered that
    track — seeing that four friends all picked choice B is a giveaway. Playing
    the math question does not unlock the general board.
    """
    if not is_track(track):
        raise QotdError(f"Unknown track '{track}'.")
    day = day or date.today()
    user_ids = scope_user_ids(session, user, scope, league_id)
    answers = {a.user_id: a for a in _answers_in_range(session, user_ids, day, day, track)}

    mine = answers.get(user.id)
    revealed = bool(mine and mine.answered_at) or day < date.today()

    visible_ids = user_ids if revealed else {user.id}
    entries: List[DailyBoardEntry] = []
    for uid in visible_ids:
        member = session.get(User, uid)
        if not member:
            continue
        a = answers.get(uid)
        if a is None:
            entry_status = "not_started"
        elif a.answered_at is None:
            entry_status = "playing"
        else:
            entry_status = "answered"
        entries.append(
            DailyBoardEntry(
                user_id=uid,
                display_name=member.display_name,
                handle=member.handle,
                avatar_url=member.avatar_url,
                status=entry_status,
                is_correct=a.is_correct if entry_status == "answered" else None,
                seconds=a.seconds if entry_status == "answered" else None,
                points=a.points if entry_status == "answered" else None,
                is_you=(uid == user.id),
            )
        )

    # Correct answers first (fastest first), then wrong answers, then anyone
    # still playing or yet to start.
    def sort_key(e: DailyBoardEntry):
        rank = 0 if e.is_correct else (1 if e.status == "answered" else 2)
        return (rank, e.seconds if e.seconds is not None else 10**6, (e.handle or e.display_name).lower())

    entries.sort(key=sort_key)
    return DailyBoardResponse(
        question_date=day,
        track=track,
        scope=scope,
        league_id=league_id,
        revealed=revealed,
        entries=entries,
    )


def week_bounds(today: Optional[date] = None) -> Tuple[date, date]:
    """The current Sun–Sat week, matching the crossword league's week."""
    today = today or date.today()
    start = today - timedelta(days=(today.weekday() + 1) % 7)
    return start, start + timedelta(days=6)


def best_streak(
    session: Session, user_id: int, through: Optional[date] = None, track: Optional[str] = None
) -> int:
    """Streak on one track, or the best across all tracks when ``track`` is None."""
    answers = _answers_for_user(session, user_id)
    day = through or date.today()
    if track is not None:
        return current_streak(answers, day, track)
    return max((current_streak(answers, day, t.slug) for t in all_tracks()), default=0)


def _longest_streak(answers: Sequence[TriviaAnswer], track: Optional[str] = None) -> int:
    rows = answers if track is None else [a for a in answers if a.track == track]
    days = sorted({a.question_date for a in rows if a.is_correct and a.answered_at})
    best = run = 0
    previous: Optional[date] = None
    for day in days:
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        previous = day
        best = max(best, run)
    return best


def leaderboard(
    session: Session,
    user: User,
    scope: str = "friends",
    league_id: Optional[int] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    track: Optional[str] = None,
) -> QotdLeaderboardResponse:
    """Points table over a date window (defaults to the current week).

    ``track=None`` combines every track into one table — each track still
    awards its own daily speed bonus, so tracks never cannibalize each other.
    """
    if track is not None and not is_track(track):
        raise QotdError(f"Unknown track '{track}'.")
    if start is None or end is None:
        start, end = week_bounds()
    user_ids = scope_user_ids(session, user, scope, league_id)
    answers = [a for a in _answers_in_range(session, user_ids, start, end, track) if a.answered_at]

    totals = apply_daily_bonus(answers)
    by_user: Dict[int, List[TriviaAnswer]] = {uid: [] for uid in user_ids}
    for a in answers:
        by_user.setdefault(a.user_id, []).append(a)

    entries: List[QotdLeaderboardEntry] = []
    for uid, rows in by_user.items():
        member = session.get(User, uid)
        if not member:
            continue
        played = len(rows)
        correct = sum(1 for a in rows if a.is_correct)
        times = [a.seconds for a in rows if a.is_correct and a.seconds is not None]
        entries.append(
            QotdLeaderboardEntry(
                user_id=uid,
                display_name=member.display_name,
                handle=member.handle,
                avatar_url=member.avatar_url,
                total_points=totals.get(uid, 0),
                played=played,
                correct=correct,
                accuracy=round(100 * correct / played, 1) if played else None,
                average_seconds=round(sum(times) / len(times), 1) if times else None,
                best_seconds=min(times) if times else None,
                current_streak=best_streak(session, uid, min(end, date.today()), track),
                is_you=(uid == user.id),
            )
        )

    entries.sort(key=lambda e: (-e.total_points, -e.correct, e.average_seconds or 10**6))
    return QotdLeaderboardResponse(
        start_date=start,
        end_date=end,
        track=track,
        scope=scope,
        league_id=league_id,
        entries=entries,
    )


def _slice(answers: Sequence[TriviaAnswer]) -> dict:
    """Aggregate a set of answered attempts into the shared stat shape."""
    played = len(answers)
    correct = sum(1 for a in answers if a.is_correct)
    times = [a.seconds for a in answers if a.is_correct and a.seconds is not None]
    return {
        "played": played,
        "correct": correct,
        "accuracy": round(100 * correct / played, 1) if played else None,
        "average_seconds": round(sum(times) / len(times), 1) if times else None,
        "best_seconds": min(times) if times else None,
        "total_points": sum(a.points for a in answers),
    }


def user_stats(session: Session, user: User) -> QotdStats:
    """Lifetime record: totals across every track, plus a per-track breakdown."""
    all_answers = _answers_for_user(session, user.id)
    answers = [a for a in all_answers if a.answered_at]

    submissions = session.exec(
        select(TriviaQuestion).where(TriviaQuestion.submitted_by == user.id)
    ).all()

    per_track: List[TrackStats] = []
    for t in all_tracks():
        rows = [a for a in answers if a.track == t.slug]
        per_track.append(
            TrackStats(
                track=t.slug,
                name=t.name,
                current_streak=current_streak(all_answers, date.today(), t.slug),
                longest_streak=_longest_streak(answers, t.slug),
                **_slice(rows),
            )
        )

    return QotdStats(
        **_slice(answers),
        # Headline streak numbers are the best a player has going on any track.
        current_streak=max((t.current_streak for t in per_track), default=0),
        longest_streak=max((t.longest_streak for t in per_track), default=0),
        submitted=len(submissions),
        submissions_live=sum(1 for q in submissions if q.question_date is not None),
        tracks=per_track,
    )


def list_tracks(session: Session, user: User, day: Optional[date] = None) -> TracksResponse:
    """Every track with the viewer's state on it today — drives the play tabs."""
    day = day or date.today()
    out: List[TrackPublic] = []
    for t in all_tracks():
        question = live_question(session, day, t.slug)
        if question is None:
            status = "no_question"
        else:
            attempt = get_answer(session, user.id, question.id)
            if attempt is None:
                status = "not_started"
            elif attempt.answered_at is None:
                status = "playing"
            else:
                status = "answered"
        out.append(_track_public(t, status, streak_for(session, user.id, day, t.slug)))
    return TracksResponse(tracks=out)


def _track_public(track: Track, status: str, streak: int) -> TrackPublic:
    return TrackPublic(
        slug=track.slug,
        name=track.name,
        description=track.description,
        example_prompt=track.example_prompt,
        max_answer_seconds=track.max_answer_seconds,
        speed_tiers=[[max_s, pts] for (max_s, pts) in track.speed_tiers],
        status=status,
        streak=streak,
    )
