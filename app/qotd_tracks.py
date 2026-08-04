"""QOTD tracks — the separate daily questions a player can play.

Each track runs its own independent daily question, bank, board, and streak.
"general" is the original trivia question; "math" is a worked problem that
naturally takes longer, so it carries its own speed tiers. This mirrors how the
crossword side treats ``puzzle_type`` (mini vs medium) with a scoring category
per type.

**Adding a track** is a one-entry change here — register it below and it shows
up in the submission form, the play page tabs, the admin queue filters, and the
boards. Nothing else needs to know about it.

Track slugs are stored on ``TriviaQuestion.track`` and ``TriviaAnswer.track``,
so a slug must not change once questions exist under it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Tier = Tuple[Optional[int], int]


@dataclass(frozen=True)
class Track:
    """One daily question stream."""

    slug: str
    name: str
    description: str
    # Speed tiers for a *correct* answer: answer within max_seconds to earn
    # points. max_seconds=None is the catch-all for anyone slower.
    speed_tiers: List[Tier]
    # Answers slower than this are clamped — an abandoned tab shouldn't produce
    # a nine-hour answer time. Also the ceiling on a track's scoreable time.
    max_answer_seconds: int
    # Placeholder shown in the submission form.
    example_prompt: str = ""
    # Extra criteria appended to the fact-checker's prompt for this track.
    verifier_notes: str = ""
    # Sort order on tabs and pickers.
    position: int = field(default=0)


GENERAL = Track(
    slug="general",
    name="General",
    description="General knowledge — one question, one shot, fastest correct answer wins the day.",
    speed_tiers=[(10, 5), (20, 4), (30, 3), (60, 2), (None, 1)],
    max_answer_seconds=120,
    example_prompt="Which planet in our solar system has the shortest day?",
    position=0,
)

MATH = Track(
    slug="math",
    name="Math",
    description="A problem you have to actually work out. Slower clock, same one-shot rule.",
    # Working a problem takes longer than recalling a fact, so the whole tier
    # table is stretched — a 30s solve here is as impressive as a 10s recall.
    speed_tiers=[(30, 5), (60, 4), (120, 3), (240, 2), (None, 1)],
    max_answer_seconds=600,
    example_prompt="A train travels 60 km in 45 minutes. What is its average speed in km/h?",
    verifier_notes=(
        "This is a MATH question: verify the arithmetic yourself, step by step, before "
        "comparing against the submitted answer. Reject any question whose distractors "
        "include a value that is also reachable by a reasonable reading of the problem."
    ),
    position=1,
)

_TRACK_LIST: List[Track] = [GENERAL, MATH]

TRACKS: Dict[str, Track] = {t.slug: t for t in _TRACK_LIST}

DEFAULT_TRACK = GENERAL.slug


def all_tracks() -> List[Track]:
    """Registered tracks in display order."""
    return sorted(_TRACK_LIST, key=lambda t: (t.position, t.slug))


def get_track(slug: Optional[str]) -> Track:
    """Look up a track, falling back to the default for None.

    Raises ``KeyError`` for an unknown slug; callers that take user input should
    validate with ``is_track`` first.
    """
    if slug is None:
        return TRACKS[DEFAULT_TRACK]
    return TRACKS[slug]


def is_track(slug: str) -> bool:
    return slug in TRACKS


def track_slugs() -> List[str]:
    return [t.slug for t in all_tracks()]
