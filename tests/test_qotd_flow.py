from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pytest

from app.friend_service import accept_request, send_request
from app.league_service import create_league, join_league
from app.models import TriviaAnswer, TriviaQuestion, User
from app.qotd_schemas import QuestionSubmit
from app.qotd_scoring import CORRECT_BASE, FASTEST_BONUS
from app.qotd_service import (
    QotdError,
    answer_question,
    daily_board,
    get_today,
    leaderboard,
    live_question,
    review_question,
    schedule_question,
    start_question,
    submit_question,
    unschedule_question,
    user_stats,
)
from app.qotd_verify import VerificationResult

QUESTION = {
    "prompt": "Which planet has the shortest day?",
    "choices": ["Mercury", "Jupiter", "Mars", "Venus"],
    "answer_index": 1,
    "explanation": "Jupiter rotates once about every 10 hours.",
}


def _make_user(session, name, is_admin=False):
    user = User(
        google_id=f"g-{name}",
        email=f"{name}@example.com",
        display_name=name.title(),
        handle=name,
        is_admin=is_admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _bank_question(session, prompt=QUESTION["prompt"], day=None, created_at=None, track="general"):
    """Insert a pre-verified question, optionally already scheduled."""
    q = TriviaQuestion(
        track=track,
        prompt=prompt,
        choices_data=json.dumps(QUESTION["choices"]),
        answer_index=QUESTION["answer_index"],
        explanation=QUESTION["explanation"],
        status="scheduled" if day else "approved",
        question_date=day,
        verdict="approve",
        verdict_confidence=100,
        created_at=created_at or datetime.utcnow(),
    )
    session.add(q)
    session.commit()
    session.refresh(q)
    return q


def _fake_verifier(monkeypatch, verdict="approve", confidence=95):
    def fake(prompt, choices, answer_index, explanation=None, track="general"):
        return VerificationResult(
            verdict=verdict,
            confidence=confidence,
            correct_answer_index=answer_index,
            explanation="Because.",
            category="Science",
            difficulty="medium",
        )

    monkeypatch.setattr("app.qotd_verify.verify_question", fake)


def _befriend(session, a, b):
    send_request(session, a, b.handle)
    accept_request(session, b, a.id)


# ---------------------------------------------------------------------------
# Submission + verification gate
# ---------------------------------------------------------------------------


def test_verified_submission_lands_in_the_bank(in_memory_session, monkeypatch):
    _fake_verifier(monkeypatch)
    alice = _make_user(in_memory_session, "alice")

    question, message = submit_question(in_memory_session, alice, QuestionSubmit(**QUESTION))
    assert question.status == "approved"
    assert question.question_date is None  # verified, not yet scheduled
    assert "bank" in message
    assert question.submitted_by == alice.id


def test_unverified_submissions_never_reach_the_bank(in_memory_session, monkeypatch):
    alice = _make_user(in_memory_session, "alice")

    _fake_verifier(monkeypatch, verdict="reject", confidence=95)
    rejected, _ = submit_question(in_memory_session, alice, QuestionSubmit(**QUESTION))
    assert rejected.status == "rejected"

    _fake_verifier(monkeypatch, verdict="needs_review", confidence=50)
    flagged, message = submit_question(in_memory_session, alice, QuestionSubmit(**QUESTION))
    assert flagged.status == "needs_review"
    assert "human" in message

    # Neither can be scheduled.
    for question in (rejected, flagged):
        with pytest.raises(QotdError, match="verified"):
            schedule_question(in_memory_session, question, date.today())


def test_admin_review_can_clear_a_flagged_question(in_memory_session, monkeypatch):
    _fake_verifier(monkeypatch, verdict="needs_review", confidence=40)
    alice = _make_user(in_memory_session, "alice")
    admin = _make_user(in_memory_session, "admin", is_admin=True)

    question, _ = submit_question(in_memory_session, alice, QuestionSubmit(**QUESTION))
    assert question.status == "needs_review"

    review_question(in_memory_session, question, admin, approve=True, notes="Checked it myself")
    assert question.status == "approved"
    assert "@admin" in question.verdict_notes
    assert "Checked it myself" in question.verdict_notes

    scheduled = schedule_question(in_memory_session, question, date.today())
    assert scheduled.question_date == date.today()


def test_submission_rejects_duplicate_choices():
    with pytest.raises(ValueError, match="distinct"):
        QuestionSubmit(
            prompt="Which planet has the shortest day?",
            choices=["Jupiter", "jupiter", "Mars", "Venus"],
            answer_index=0,
        )


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


def test_live_question_auto_promotes_the_oldest_banked_question(in_memory_session):
    old = _bank_question(
        in_memory_session, "Older question here?", created_at=datetime.utcnow() - timedelta(days=2)
    )
    _bank_question(in_memory_session, "Newer question here?")

    promoted = live_question(in_memory_session)
    assert promoted.id == old.id
    assert promoted.question_date == date.today()
    assert promoted.status == "scheduled"

    # Stable: a second call returns the same question rather than burning another.
    assert live_question(in_memory_session).id == old.id


def test_live_question_is_none_with_an_empty_bank(in_memory_session):
    assert live_question(in_memory_session) is None


def test_history_is_never_backfilled(in_memory_session):
    _bank_question(in_memory_session)
    assert live_question(in_memory_session, date.today() - timedelta(days=3)) is None


def test_one_question_per_date_and_no_pulling_a_live_one(in_memory_session):
    _bank_question(in_memory_session, "First one?", day=date.today())
    second = _bank_question(in_memory_session, "Second one?")

    with pytest.raises(QotdError, match="already scheduled"):
        schedule_question(in_memory_session, second, date.today())

    with pytest.raises(QotdError, match="only be scheduled for today"):
        schedule_question(in_memory_session, second, date.today() - timedelta(days=1))

    tomorrow = schedule_question(in_memory_session, second, date.today() + timedelta(days=1))
    assert unschedule_question(in_memory_session, tomorrow).question_date is None

    live = live_question(in_memory_session)
    with pytest.raises(QotdError, match="already live"):
        unschedule_question(in_memory_session, live)


# ---------------------------------------------------------------------------
# Play loop
# ---------------------------------------------------------------------------


def test_answer_key_is_hidden_until_you_answer(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")

    before = get_today(in_memory_session, alice)
    assert before.question.id == question.id
    assert before.answer_index is None
    assert before.explanation is None
    # The public view carries choices but no key.
    assert before.question.choices == QUESTION["choices"]
    assert not hasattr(before.question, "answer_index")

    start_question(in_memory_session, alice, question.id)
    still_hidden = get_today(in_memory_session, alice)
    assert still_hidden.answer_index is None

    answer_question(in_memory_session, alice, question.id, 1)
    after = get_today(in_memory_session, alice)
    assert after.answer_index == 1
    assert after.explanation == QUESTION["explanation"]


def test_correct_answer_scores_and_wrong_answer_does_not(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    start_question(in_memory_session, alice, question.id)
    right = answer_question(in_memory_session, alice, question.id, 1)
    assert right.is_correct
    assert right.points >= CORRECT_BASE
    assert right.streak == 1
    assert right.explanation == QUESTION["explanation"]

    start_question(in_memory_session, bob, question.id)
    wrong = answer_question(in_memory_session, bob, question.id, 0)
    assert not wrong.is_correct
    assert wrong.points == 0
    assert wrong.streak == 0
    # The key is revealed with the result either way.
    assert wrong.answer_index == 1


def test_you_only_get_one_shot(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")

    start_question(in_memory_session, alice, question.id)
    answer_question(in_memory_session, alice, question.id, 0)

    with pytest.raises(QotdError, match="already answered"):
        answer_question(in_memory_session, alice, question.id, 1)


def test_answering_requires_starting_first(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")

    with pytest.raises(QotdError, match="haven't started"):
        answer_question(in_memory_session, alice, question.id, 1)


def test_start_is_idempotent_and_does_not_restart_the_clock(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")

    first = start_question(in_memory_session, alice, question.id)
    first.started_at = datetime.utcnow() - timedelta(seconds=30)
    in_memory_session.add(first)
    in_memory_session.commit()

    second = start_question(in_memory_session, alice, question.id)
    assert second.id == first.id
    result = answer_question(in_memory_session, alice, question.id, 1)
    assert result.seconds >= 30


def test_old_questions_cannot_be_played(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today() - timedelta(days=1))
    alice = _make_user(in_memory_session, "alice")

    with pytest.raises(QotdError, match="Only today's question"):
        start_question(in_memory_session, alice, question.id)


def test_streak_extends_from_yesterday(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    yesterday = _bank_question(in_memory_session, "Yesterday?", day=date.today() - timedelta(days=1))
    in_memory_session.add(
        TriviaAnswer(
            user_id=alice.id,
            question_id=yesterday.id,
            question_date=yesterday.question_date,
            started_at=datetime.utcnow(),
            answered_at=datetime.utcnow(),
            seconds=10,
            selected_index=1,
            is_correct=True,
            points=7,
        )
    )
    in_memory_session.commit()

    today = _bank_question(in_memory_session, day=date.today())
    start_question(in_memory_session, alice, today.id)
    result = answer_question(in_memory_session, alice, today.id, 1)
    assert result.streak == 2


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------


def test_friends_results_stay_hidden_until_you_play(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    _befriend(in_memory_session, alice, bob)

    start_question(in_memory_session, bob, question.id)
    answer_question(in_memory_session, bob, question.id, 1)

    hidden = daily_board(in_memory_session, alice, scope="friends")
    assert hidden.revealed is False
    assert [e.user_id for e in hidden.entries] == [alice.id]

    start_question(in_memory_session, alice, question.id)
    answer_question(in_memory_session, alice, question.id, 0)

    revealed = daily_board(in_memory_session, alice, scope="friends")
    assert revealed.revealed is True
    # Bob got it right, so he sorts above Alice, who didn't.
    assert [e.user_id for e in revealed.entries] == [bob.id, alice.id]
    assert revealed.entries[0].is_correct is True
    assert revealed.entries[1].is_you is True


def test_board_shows_who_is_still_playing(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    carol = _make_user(in_memory_session, "carol")
    _befriend(in_memory_session, alice, bob)
    _befriend(in_memory_session, alice, carol)

    start_question(in_memory_session, alice, question.id)
    answer_question(in_memory_session, alice, question.id, 1)
    start_question(in_memory_session, bob, question.id)  # started, not answered

    board = daily_board(in_memory_session, alice, scope="friends")
    by_user = {e.user_id: e for e in board.entries}
    assert by_user[bob.id].status == "playing"
    assert by_user[bob.id].seconds is None
    assert by_user[carol.id].status == "not_started"


def test_league_scope_requires_membership(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    league = create_league(in_memory_session, "Trivia Night", alice, visibility="public")

    with pytest.raises(QotdError, match="not a member"):
        daily_board(in_memory_session, bob, scope="league", league_id=league.id)

    join_league(in_memory_session, league.invite_code, bob)
    board = daily_board(in_memory_session, bob, scope="league", league_id=league.id)
    assert board.league_id == league.id

    with pytest.raises(QotdError, match="league id is required"):
        daily_board(in_memory_session, alice, scope="league")


def test_weekly_leaderboard_ranks_on_points(in_memory_session):
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    _befriend(in_memory_session, alice, bob)

    # Bob answers correctly; Alice gets it wrong.
    start_question(in_memory_session, bob, question.id)
    bob_result = answer_question(in_memory_session, bob, question.id, 1)
    start_question(in_memory_session, alice, question.id)
    answer_question(in_memory_session, alice, question.id, 3)

    board = leaderboard(in_memory_session, alice, scope="friends")
    assert [e.user_id for e in board.entries] == [bob.id, alice.id]

    top = board.entries[0]
    # Fastest (only) correct answer of the day picks up the bonus.
    assert top.total_points == bob_result.points + FASTEST_BONUS
    assert top.correct == 1
    assert top.accuracy == 100.0
    assert board.entries[1].total_points == 0
    assert board.entries[1].accuracy == 0.0


def test_leaderboard_includes_friends_who_have_not_played(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    _befriend(in_memory_session, alice, bob)

    board = leaderboard(in_memory_session, alice, scope="friends")
    assert {e.user_id for e in board.entries} == {alice.id, bob.id}
    assert all(e.played == 0 and e.accuracy is None for e in board.entries)


def test_user_stats(in_memory_session, monkeypatch):
    _fake_verifier(monkeypatch)
    question = _bank_question(in_memory_session, day=date.today())
    alice = _make_user(in_memory_session, "alice")

    start_question(in_memory_session, alice, question.id)
    result = answer_question(in_memory_session, alice, question.id, 1)
    submit_question(
        in_memory_session, alice, QuestionSubmit(**{**QUESTION, "prompt": "A different question?"})
    )

    stats = user_stats(in_memory_session, alice)
    assert stats.played == 1
    assert stats.correct == 1
    assert stats.accuracy == 100.0
    assert stats.total_points == result.points
    assert stats.current_streak == 1
    assert stats.longest_streak == 1
    assert stats.submitted == 1
    assert stats.submissions_live == 0
