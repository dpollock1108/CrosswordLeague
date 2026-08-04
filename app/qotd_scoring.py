"""Scoring for the daily trivia question (QOTD).

Mirrors the crossword scoring model — a tier table on finish time — but adds a
correctness gate: a wrong answer scores nothing no matter how fast it came in.

Points split into two halves:

* **Personal points**, computed the moment a player answers and stored on the
  ``TriviaAnswer`` row: correctness base + speed tier + streak bonus. These
  depend only on that player, so they are stable and can be shown immediately.
* **The fastest-of-the-day bonus**, which depends on who else played and is
  therefore scope-relative — the fastest correct answer among your friends is
  not the fastest in your league. It is applied when a board is built, never
  stored. This matches ``scoring.assign_daily_points``.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .models import TriviaAnswer

Tier = Tuple[Optional[int], int]

# A question is a single click; anything past this is treated as "looked it up"
# and clamped, so an abandoned tab can't produce a 9-hour answer time.
MAX_ANSWER_SECONDS = 120

# Speed tiers for a *correct* answer: answer within max_seconds to earn points.
# max_seconds=None is the catch-all for anyone slower.
SPEED_TIERS: List[Tier] = [(10, 5), (20, 4), (30, 3), (60, 2), (None, 1)]

# Flat points for getting it right at all, before speed is considered.
CORRECT_BASE = 2

# Awarded to the fastest correct answer within a board's scope.
FASTEST_BONUS = 1

# Streak thresholds: (consecutive correct days, bonus points).
STREAK_TIERS: List[Tuple[int, int]] = [(30, 4), (14, 3), (7, 2), (3, 1)]


def speed_points(seconds: int) -> int:
    """Points from the speed tier table for a correct answer."""
    for max_seconds, points in SPEED_TIERS:
        if max_seconds is None or seconds <= max_seconds:
            return points
    return 0


def streak_bonus(streak: int) -> int:
    """Bonus points for a correct-answer streak *including* today's answer."""
    for threshold, bonus in STREAK_TIERS:
        if streak >= threshold:
            return bonus
    return 0


def personal_points(is_correct: bool, seconds: int, streak: int = 0) -> int:
    """Points a single player earns, independent of everyone else's results."""
    if not is_correct:
        return 0
    return CORRECT_BASE + speed_points(seconds) + streak_bonus(streak)


def clamp_seconds(seconds: float) -> int:
    """Normalize a measured elapsed time into the scoreable range."""
    return max(0, min(int(seconds), MAX_ANSWER_SECONDS))


def current_streak(answers: Sequence[TriviaAnswer], through: date) -> int:
    """Length of the run of consecutive correct days ending on ``through``.

    A day with no answer breaks the streak, as does a wrong answer. Only
    completed answers count.
    """
    correct_days = {a.question_date for a in answers if a.is_correct and a.answered_at is not None}
    streak = 0
    day = through
    while day in correct_days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def apply_daily_bonus(answers: Iterable[TriviaAnswer]) -> Dict[int, int]:
    """Total points per user for a set of answers, adding the daily speed bonus.

    ``answers`` should already be filtered to the board's scope (a friend list
    or a league). The fastest correct answer *on each date* earns
    ``FASTEST_BONUS``; ties all earn it.
    """
    by_date: Dict[date, List[TriviaAnswer]] = defaultdict(list)
    for a in answers:
        if a.answered_at is not None:
            by_date[a.question_date].append(a)

    totals: Dict[int, int] = defaultdict(int)
    for day_answers in by_date.values():
        correct = [a for a in day_answers if a.is_correct and a.seconds is not None]
        best = min((a.seconds for a in correct), default=None)
        for a in day_answers:
            totals[a.user_id] += a.points
            if best is not None and a.is_correct and a.seconds == best:
                totals[a.user_id] += FASTEST_BONUS
    return dict(totals)
