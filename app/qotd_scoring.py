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

Everything here is per-track: each track carries its own speed tiers (a math
problem takes longer to work than a fact takes to recall), its own daily bonus,
and its own streak. See qotd_tracks.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, Iterable, List, Sequence, Tuple

from .models import TriviaAnswer
from .qotd_tracks import DEFAULT_TRACK, Tier, get_track

# Flat points for getting it right at all, before speed is considered.
CORRECT_BASE = 2

# Awarded to the fastest correct answer within a board's scope, per track.
FASTEST_BONUS = 1

# Streak thresholds: (consecutive correct days, bonus points).
STREAK_TIERS: List[Tuple[int, int]] = [(30, 4), (14, 3), (7, 2), (3, 1)]


def speed_tiers(track: str = DEFAULT_TRACK) -> List[Tier]:
    return get_track(track).speed_tiers


def max_answer_seconds(track: str = DEFAULT_TRACK) -> int:
    return get_track(track).max_answer_seconds


def speed_points(seconds: int, track: str = DEFAULT_TRACK) -> int:
    """Points from the track's speed tier table for a correct answer."""
    for max_seconds, points in speed_tiers(track):
        if max_seconds is None or seconds <= max_seconds:
            return points
    return 0


def streak_bonus(streak: int) -> int:
    """Bonus points for a correct-answer streak *including* today's answer."""
    for threshold, bonus in STREAK_TIERS:
        if streak >= threshold:
            return bonus
    return 0


def personal_points(
    is_correct: bool, seconds: int, streak: int = 0, track: str = DEFAULT_TRACK
) -> int:
    """Points a single player earns, independent of everyone else's results."""
    if not is_correct:
        return 0
    return CORRECT_BASE + speed_points(seconds, track) + streak_bonus(streak)


def clamp_seconds(seconds: float, track: str = DEFAULT_TRACK) -> int:
    """Normalize a measured elapsed time into the track's scoreable range."""
    return max(0, min(int(seconds), max_answer_seconds(track)))


def current_streak(
    answers: Sequence[TriviaAnswer], through: date, track: str = DEFAULT_TRACK
) -> int:
    """Length of the run of consecutive correct days ending on ``through``.

    Streaks are per-track: answering the math question does not keep a general
    streak alive. A day with no answer breaks the run, as does a wrong answer.
    Only completed answers count.
    """
    correct_days = {
        a.question_date
        for a in answers
        if a.is_correct and a.answered_at is not None and a.track == track
    }
    streak = 0
    day = through
    while day in correct_days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def apply_daily_bonus(answers: Iterable[TriviaAnswer]) -> Dict[int, int]:
    """Total points per user for a set of answers, adding the daily speed bonus.

    ``answers`` should already be filtered to the board's scope (a friend list
    or a league); it may span several tracks. The fastest correct answer *per
    track per date* earns ``FASTEST_BONUS``; ties all earn it. Tracks never
    compete with each other for the bonus.
    """
    by_day_track: Dict[Tuple[date, str], List[TriviaAnswer]] = defaultdict(list)
    for a in answers:
        if a.answered_at is not None:
            by_day_track[(a.question_date, a.track)].append(a)

    totals: Dict[int, int] = defaultdict(int)
    for group in by_day_track.values():
        correct = [a for a in group if a.is_correct and a.seconds is not None]
        best = min((a.seconds for a in correct), default=None)
        for a in group:
            totals[a.user_id] += a.points
            if best is not None and a.is_correct and a.seconds == best:
                totals[a.user_id] += FASTEST_BONUS
    return dict(totals)
