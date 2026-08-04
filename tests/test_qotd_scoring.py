from __future__ import annotations

from datetime import date, datetime, timedelta

from app.models import TriviaAnswer
from app.qotd_scoring import (
    CORRECT_BASE,
    FASTEST_BONUS,
    MAX_ANSWER_SECONDS,
    apply_daily_bonus,
    clamp_seconds,
    current_streak,
    personal_points,
    speed_points,
    streak_bonus,
)


def _answer(user_id, day, correct, seconds, points):
    return TriviaAnswer(
        user_id=user_id,
        question_id=1,
        question_date=day,
        started_at=datetime.utcnow(),
        answered_at=datetime.utcnow(),
        seconds=seconds,
        is_correct=correct,
        points=points,
    )


def test_speed_tiers():
    assert speed_points(5) == 5
    assert speed_points(10) == 5
    assert speed_points(11) == 4
    assert speed_points(30) == 3
    assert speed_points(60) == 2
    assert speed_points(90) == 1


def test_wrong_answers_score_nothing_however_fast():
    assert personal_points(is_correct=False, seconds=1) == 0
    assert personal_points(is_correct=False, seconds=1, streak=10) == 0


def test_correct_answer_points_are_base_plus_speed_plus_streak():
    assert personal_points(is_correct=True, seconds=5) == CORRECT_BASE + 5
    assert personal_points(is_correct=True, seconds=45, streak=7) == CORRECT_BASE + 2 + 2


def test_streak_bonus_thresholds():
    assert streak_bonus(0) == 0
    assert streak_bonus(2) == 0
    assert streak_bonus(3) == 1
    assert streak_bonus(7) == 2
    assert streak_bonus(14) == 3
    assert streak_bonus(45) == 4


def test_clamp_seconds():
    assert clamp_seconds(-3) == 0
    assert clamp_seconds(12.9) == 12
    assert clamp_seconds(99999) == MAX_ANSWER_SECONDS


def test_current_streak_breaks_on_miss_and_on_wrong_answer():
    today = date(2026, 8, 4)
    answers = [
        _answer(1, today, True, 10, 7),
        _answer(1, today - timedelta(days=1), True, 20, 6),
        _answer(1, today - timedelta(days=2), False, 20, 0),
        _answer(1, today - timedelta(days=3), True, 20, 6),
    ]
    assert current_streak(answers, today) == 2

    # A day with no answer at all also ends the run.
    gapped = [
        _answer(1, today, True, 10, 7),
        _answer(1, today - timedelta(days=2), True, 10, 7),
    ]
    assert current_streak(gapped, today) == 1
    assert current_streak([], today) == 0


def test_fastest_correct_answer_of_the_day_earns_the_bonus():
    day = date(2026, 8, 4)
    answers = [
        _answer(1, day, True, 8, 7),
        _answer(2, day, True, 25, 5),
        _answer(3, day, False, 4, 0),
    ]
    totals = apply_daily_bonus(answers)
    assert totals[1] == 7 + FASTEST_BONUS
    assert totals[2] == 5
    # Fast but wrong earns nothing at all.
    assert totals[3] == 0


def test_daily_bonus_is_shared_on_a_tie_and_summed_across_days():
    d1, d2 = date(2026, 8, 3), date(2026, 8, 4)
    answers = [
        _answer(1, d1, True, 10, 7),
        _answer(2, d1, True, 10, 7),
        _answer(1, d2, True, 40, 4),
    ]
    totals = apply_daily_bonus(answers)
    assert totals[1] == (7 + FASTEST_BONUS) + (4 + FASTEST_BONUS)
    assert totals[2] == 7 + FASTEST_BONUS


def test_unanswered_attempts_are_ignored():
    day = date(2026, 8, 4)
    started_only = TriviaAnswer(
        user_id=9, question_id=1, question_date=day, started_at=datetime.utcnow()
    )
    assert apply_daily_bonus([started_only]) == {}
