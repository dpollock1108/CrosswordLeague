from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pytest

from app.friend_service import accept_request, send_request
from app.models import TriviaAnswer, TriviaQuestion, User
from app.qotd_schemas import QuestionSubmit
from app.qotd_scoring import (
    CORRECT_BASE,
    FASTEST_BONUS,
    apply_daily_bonus,
    clamp_seconds,
    current_streak,
    max_answer_seconds,
    personal_points,
    speed_points,
)
from app.qotd_service import (
    QotdError,
    answer_question,
    daily_board,
    get_today,
    leaderboard,
    list_questions_admin,
    list_tracks,
    live_question,
    schedule_question,
    start_question,
    submit_question,
    user_stats,
)
from app.qotd_tracks import DEFAULT_TRACK, all_tracks, get_track, is_track, track_slugs
from app.qotd_verify import VerificationResult

CHOICES = ["Mercury", "Jupiter", "Mars", "Venus"]
ANSWER = 1


def _make_user(session, name):
    user = User(
        google_id=f"g-{name}", email=f"{name}@example.com", display_name=name.title(), handle=name
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _bank(session, prompt, track="general", day=None, created_at=None):
    q = TriviaQuestion(
        track=track,
        prompt=prompt,
        choices_data=json.dumps(CHOICES),
        answer_index=ANSWER,
        explanation="Because.",
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


def _answered(session, user, question, correct=True, seconds=10, day=None, points=None):
    """Record a completed answer directly, for building history."""
    track = question.track
    row = TriviaAnswer(
        user_id=user.id,
        question_id=question.id,
        track=track,
        question_date=day or question.question_date,
        started_at=datetime.utcnow(),
        answered_at=datetime.utcnow(),
        seconds=seconds,
        selected_index=ANSWER if correct else 0,
        is_correct=correct,
        points=points if points is not None else personal_points(correct, seconds, 0, track),
    )
    session.add(row)
    session.commit()
    return row


def _befriend(session, a, b):
    send_request(session, a, b.handle)
    accept_request(session, b, a.id)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_registry_exposes_general_and_math():
    slugs = track_slugs()
    assert slugs[0] == DEFAULT_TRACK == "general"
    assert "math" in slugs
    assert is_track("general") and is_track("math")
    assert not is_track("nonsense")


def test_each_track_has_its_own_speed_tiers():
    # A math problem takes longer to work than a fact takes to recall, so the
    # tier table is stretched — 30s is top marks on math, mid-table on general.
    assert speed_points(30, "math") == 5
    assert speed_points(30, "general") == 3
    assert max_answer_seconds("math") > max_answer_seconds("general")
    assert clamp_seconds(500, "math") == 500
    assert clamp_seconds(500, "general") == max_answer_seconds("general")


def test_points_use_the_answering_track_tiers():
    assert personal_points(True, 30, 0, "math") == CORRECT_BASE + 5
    assert personal_points(True, 30, 0, "general") == CORRECT_BASE + 3


def test_every_registered_track_is_well_formed():
    for t in all_tracks():
        assert t.speed_tiers, f"{t.slug} has no tiers"
        # Exactly one catch-all, so no correct answer ever scores zero speed.
        assert sum(1 for (max_s, _) in t.speed_tiers if max_s is None) == 1
        assert t.max_answer_seconds > 0
        assert get_track(t.slug) is t


# ---------------------------------------------------------------------------
# Independent daily questions
# ---------------------------------------------------------------------------


def test_each_track_runs_its_own_question_on_the_same_day(in_memory_session):
    general = _bank(in_memory_session, "General one?", track="general")
    math = _bank(in_memory_session, "Math one?", track="math")

    live_general = live_question(in_memory_session, track="general")
    live_math = live_question(in_memory_session, track="math")
    assert live_general.id == general.id
    assert live_math.id == math.id
    assert live_general.question_date == live_math.question_date == date.today()


def test_scheduling_clash_is_per_track(in_memory_session):
    _bank(in_memory_session, "General today?", track="general", day=date.today())
    math = _bank(in_memory_session, "Math today?", track="math")

    # Same date, different track — allowed.
    scheduled = schedule_question(in_memory_session, math, date.today())
    assert scheduled.question_date == date.today()

    # Same date, same track — rejected, and the message names the track.
    another_general = _bank(in_memory_session, "Second general?", track="general")
    with pytest.raises(QotdError, match="General track"):
        schedule_question(in_memory_session, another_general, date.today())


def test_a_track_never_borrows_from_another_tracks_bank(in_memory_session):
    _bank(in_memory_session, "Only a general question?", track="general")
    # Math bank is empty — math simply has no question rather than serving the
    # general one.
    assert live_question(in_memory_session, track="math") is None
    assert live_question(in_memory_session, track="general") is not None


def test_auto_promotion_picks_the_oldest_within_the_track(in_memory_session):
    _bank(
        in_memory_session,
        "Old general question?",
        track="general",
        created_at=datetime.utcnow() - timedelta(days=5),
    )
    old_math = _bank(
        in_memory_session,
        "Old math question?",
        track="math",
        created_at=datetime.utcnow() - timedelta(days=3),
    )
    _bank(in_memory_session, "New math question?", track="math")

    assert live_question(in_memory_session, track="math").id == old_math.id


def test_get_today_rejects_an_unknown_track(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    with pytest.raises(QotdError, match="Unknown track"):
        get_today(in_memory_session, alice, track="astrology")


def test_submission_rejects_an_unknown_track():
    with pytest.raises(ValueError, match="Unknown track"):
        QuestionSubmit(
            track="astrology",
            prompt="Which planet has the shortest day?",
            choices=CHOICES,
            answer_index=ANSWER,
        )


def test_submissions_stay_on_their_track(in_memory_session, monkeypatch):
    def fake(prompt, choices, answer_index, explanation=None, track="general"):
        return VerificationResult(
            verdict="approve", confidence=95, correct_answer_index=answer_index
        )

    monkeypatch.setattr("app.qotd_verify.verify_question", fake)
    alice = _make_user(in_memory_session, "alice")

    question, _ = submit_question(
        in_memory_session,
        alice,
        QuestionSubmit(
            track="math",
            prompt="What is 15% of 240?",
            choices=["30", "36", "38", "42"],
            answer_index=1,
        ),
    )
    assert question.track == "math"
    assert [q.id for q in list_questions_admin(in_memory_session, track="math")] == [question.id]
    assert list_questions_admin(in_memory_session, track="general") == []


def test_verifier_receives_the_track(in_memory_session, monkeypatch):
    seen = {}

    def fake(prompt, choices, answer_index, explanation=None, track="general"):
        seen["track"] = track
        return VerificationResult(verdict="approve", confidence=95, correct_answer_index=answer_index)

    monkeypatch.setattr("app.qotd_verify.verify_question", fake)
    alice = _make_user(in_memory_session, "alice")
    submit_question(
        in_memory_session,
        alice,
        QuestionSubmit(
            track="math", prompt="What is 15% of 240?", choices=["30", "36", "38", "42"], answer_index=1
        ),
    )
    assert seen["track"] == "math"


# ---------------------------------------------------------------------------
# Playing, streaks, and boards
# ---------------------------------------------------------------------------


def test_answering_one_track_leaves_the_other_untouched(in_memory_session):
    general = _bank(in_memory_session, "General one?", track="general", day=date.today())
    _bank(in_memory_session, "Math one?", track="math", day=date.today())
    alice = _make_user(in_memory_session, "alice")

    start_question(in_memory_session, alice, general.id)
    answer_question(in_memory_session, alice, general.id, ANSWER)

    assert get_today(in_memory_session, alice, track="general").attempt.answered_at is not None
    math_today = get_today(in_memory_session, alice, track="math")
    assert math_today.attempt is None
    assert math_today.answer_index is None  # key still withheld on the unplayed track


def test_answer_scores_with_its_own_tracks_tiers(in_memory_session):
    math = _bank(in_memory_session, "Math one?", track="math", day=date.today())
    alice = _make_user(in_memory_session, "alice")

    attempt = start_question(in_memory_session, alice, math.id)
    attempt.started_at = datetime.utcnow() - timedelta(seconds=25)
    in_memory_session.add(attempt)
    in_memory_session.commit()

    result = answer_question(in_memory_session, alice, math.id, ANSWER)
    assert result.track == "math"
    # 25s is top tier on math; the same time is only tier 3 on general. A
    # streak of 1 earns no bonus, so this is base + speed alone.
    assert result.points == CORRECT_BASE + 5
    assert result.points > CORRECT_BASE + speed_points(25, "general")
    assert result.seconds == 25


def test_streaks_are_per_track(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    yesterday = date.today() - timedelta(days=1)

    # A correct general answer yesterday; nothing on math.
    old_general = _bank(in_memory_session, "General yesterday?", track="general", day=yesterday)
    _answered(in_memory_session, alice, old_general, correct=True)

    general = _bank(in_memory_session, "General today?", track="general", day=date.today())
    math = _bank(in_memory_session, "Math today?", track="math", day=date.today())

    start_question(in_memory_session, alice, general.id)
    general_result = answer_question(in_memory_session, alice, general.id, ANSWER)
    start_question(in_memory_session, alice, math.id)
    math_result = answer_question(in_memory_session, alice, math.id, ANSWER)

    assert general_result.streak == 2  # continues yesterday's general run
    assert math_result.streak == 1  # math starts from scratch


def test_current_streak_ignores_other_tracks(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    today = date.today()
    rows = []
    for offset in range(3):
        day = today - timedelta(days=offset)
        q = _bank(in_memory_session, f"Math {offset}?", track="math", day=day)
        rows.append(_answered(in_memory_session, alice, q, correct=True, day=day))
    general_q = _bank(in_memory_session, "General today?", track="general", day=today)
    rows.append(_answered(in_memory_session, alice, general_q, correct=True, day=today))

    assert current_streak(rows, today, "math") == 3
    assert current_streak(rows, today, "general") == 1


def test_daily_bonus_is_awarded_per_track(in_memory_session):
    day = date.today()
    general = _bank(in_memory_session, "General?", track="general", day=day)
    math = _bank(in_memory_session, "Math?", track="math", day=day)
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    # Alice is fastest on general, Bob is fastest on math.
    a_gen = _answered(in_memory_session, alice, general, seconds=5, points=7)
    b_gen = _answered(in_memory_session, bob, general, seconds=40, points=4)
    a_math = _answered(in_memory_session, alice, math, seconds=90, points=5)
    b_math = _answered(in_memory_session, bob, math, seconds=20, points=7)

    totals = apply_daily_bonus([a_gen, b_gen, a_math, b_math])
    # Each wins one bonus rather than the overall-fastest taking both.
    assert totals[alice.id] == 7 + FASTEST_BONUS + 5
    assert totals[bob.id] == 4 + 7 + FASTEST_BONUS


def test_board_is_scoped_to_one_track(in_memory_session):
    day = date.today()
    general = _bank(in_memory_session, "General?", track="general", day=day)
    math = _bank(in_memory_session, "Math?", track="math", day=day)
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    _befriend(in_memory_session, alice, bob)

    _answered(in_memory_session, alice, general, seconds=8, points=7)
    _answered(in_memory_session, bob, math, seconds=8, points=7)

    general_board = daily_board(in_memory_session, alice, track="general")
    assert general_board.track == "general"
    assert general_board.revealed is True
    by_user = {e.user_id: e for e in general_board.entries}
    # Bob answered math, not general — he shows as not started here.
    assert by_user[bob.id].status == "not_started"

    # Alice hasn't played math, so that board stays hidden to her.
    math_board = daily_board(in_memory_session, alice, track="math")
    assert math_board.revealed is False
    assert [e.user_id for e in math_board.entries] == [alice.id]


def test_leaderboard_filters_by_track_and_combines_by_default(in_memory_session):
    day = date.today()
    general = _bank(in_memory_session, "General?", track="general", day=day)
    math = _bank(in_memory_session, "Math?", track="math", day=day)
    alice = _make_user(in_memory_session, "alice")

    _answered(in_memory_session, alice, general, seconds=5, points=7)
    _answered(in_memory_session, alice, math, seconds=25, points=7)

    general_only = leaderboard(in_memory_session, alice, track="general")
    assert general_only.track == "general"
    assert general_only.entries[0].total_points == 7 + FASTEST_BONUS
    assert general_only.entries[0].played == 1

    combined = leaderboard(in_memory_session, alice)
    assert combined.track is None
    # Both tracks counted, each with its own daily bonus.
    assert combined.entries[0].total_points == (7 + FASTEST_BONUS) * 2
    assert combined.entries[0].played == 2


def test_stats_break_down_by_track(in_memory_session):
    day = date.today()
    general = _bank(in_memory_session, "General?", track="general", day=day)
    math = _bank(in_memory_session, "Math?", track="math", day=day)
    alice = _make_user(in_memory_session, "alice")

    _answered(in_memory_session, alice, general, correct=True, seconds=5, points=7)
    _answered(in_memory_session, alice, math, correct=False, seconds=60, points=0)

    stats = user_stats(in_memory_session, alice)
    assert stats.played == 2
    assert stats.correct == 1
    by_track = {t.track: t for t in stats.tracks}
    assert set(by_track) == set(track_slugs())
    assert by_track["general"].correct == 1
    assert by_track["general"].current_streak == 1
    assert by_track["math"].correct == 0
    assert by_track["math"].current_streak == 0
    # Headline streak is the best across tracks.
    assert stats.current_streak == 1


def test_list_tracks_reports_per_track_status(in_memory_session):
    general = _bank(in_memory_session, "General?", track="general", day=date.today())
    _bank(in_memory_session, "Math?", track="math", day=date.today())
    alice = _make_user(in_memory_session, "alice")

    start_question(in_memory_session, alice, general.id)
    answer_question(in_memory_session, alice, general.id, ANSWER)

    tracks = {t.slug: t for t in list_tracks(in_memory_session, alice).tracks}
    assert tracks["general"].status == "answered"
    assert tracks["general"].streak == 1
    assert tracks["math"].status == "not_started"
    assert tracks["math"].speed_tiers[0] == [30, 5]


def test_list_tracks_flags_a_track_with_an_empty_bank(in_memory_session):
    _bank(in_memory_session, "General?", track="general", day=date.today())
    alice = _make_user(in_memory_session, "alice")

    tracks = {t.slug: t for t in list_tracks(in_memory_session, alice).tracks}
    assert tracks["general"].status == "not_started"
    assert tracks["math"].status == "no_question"
