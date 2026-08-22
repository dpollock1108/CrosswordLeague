"""Unattended publishing of the next day's puzzles.

The pieces already existed — generate writes a draft into the repository, assign
gives a draft a date and publishes it — but nothing joined them up, so every day
depended on somebody remembering.

The order here matters. The obvious shape, "generate tomorrow's puzzle then
publish it", makes every single day depend on an AI call and a CSP solve both
succeeding in the next few seconds; when they don't, there is no puzzle at
midnight and nobody finds out until players do. So this publishes from a buffer
of already-generated drafts and *then* tops the buffer back up. A generation
failure costs one day of buffer depth rather than the day's puzzle, and there
are several days of warning before it becomes anyone's problem.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from sqlmodel import Session, select

from .models import Puzzle

logger = logging.getLogger(__name__)

# Types the job keeps stocked. Both are generatable; other sizes are built by
# hand and are deliberately not this job's problem.
PUZZLE_TYPES: tuple[str, ...] = ("mini_5x5", "medium_9x9")

SIZE_FOR_TYPE = {"mini_5x5": 5, "medium_9x9": 9}

# How many unassigned drafts of each type to keep on hand. Three days of buffer
# means a generation outage has to last three days before it reaches a player.
BUFFER_TARGET = 3

# Cap on generation attempts per run, so a run can't spend forever in the solver
# or run up an unbounded Anthropic bill after a long outage. The buffer refills
# over several runs instead.
MAX_GENERATE_PER_RUN = 2

DEFAULT_DIFFICULTY = "medium"


@dataclass
class TypeOutcome:
    """What happened for one puzzle type in one run."""

    puzzle_type: str
    target_date: date
    published_puzzle_id: Optional[int] = None
    already_published: bool = False
    generated: int = 0
    buffer_remaining: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """A run is fine if tomorrow has a puzzle, even if topping up failed."""
        return self.published_puzzle_id is not None or self.already_published


def next_puzzle_date(today: Optional[date] = None) -> date:
    """The date this job publishes for.

    NOTE: `date.today()` is UTC in the container, matching the rest of the app,
    so "tomorrow" flips at 00:00 UTC. If the rollover timezone ever changes,
    this and the scheduler's cron expression have to move together.
    """
    return (today or date.today()) + timedelta(days=1)


def _published_for(session: Session, puzzle_type: str, on: date) -> Optional[Puzzle]:
    return session.exec(
        select(Puzzle).where(Puzzle.puzzle_type == puzzle_type, Puzzle.puzzle_date == on)
    ).first()


def _drafts(session: Session, puzzle_type: str) -> list[Puzzle]:
    """Unassigned drafts of a type, oldest first — the repository buffer."""
    return list(
        session.exec(
            select(Puzzle)
            .where(
                Puzzle.puzzle_type == puzzle_type,
                Puzzle.puzzle_date == None,  # noqa: E711 — SQL NULL test, not identity
                Puzzle.status == "draft",
            )
            .order_by(Puzzle.created_at)  # type: ignore[arg-type]
        ).all()
    )


def _generate_draft(session: Session, puzzle_type: str) -> Puzzle:
    """Generate one puzzle into the repository. Raises if generation fails."""
    from .puzzle_gen import puzzle_to_json_strings
    from .puzzle_gen_ai import generate_puzzle as ai_generate

    size = SIZE_FOR_TYPE[puzzle_type]
    data = ai_generate(size=size, difficulty=DEFAULT_DIFFICULTY)
    grid_json, clues_json = puzzle_to_json_strings(data)

    puzzle = Puzzle(
        puzzle_type=puzzle_type,
        puzzle_date=None,
        size=size,
        grid_data=grid_json,
        clues_data=clues_json,
        title=data.get("title"),
        difficulty=DEFAULT_DIFFICULTY,
        created_by="ai",
    )
    session.add(puzzle)
    session.commit()
    session.refresh(puzzle)
    return puzzle


def _publish(session: Session, puzzle: Puzzle, on: date) -> Puzzle:
    """Give a draft a date and make it live. Mirrors the assign endpoint."""
    puzzle.puzzle_date = on
    puzzle.status = "published"
    puzzle.published_at = datetime.utcnow()
    session.add(puzzle)
    session.commit()
    session.refresh(puzzle)
    return puzzle


def publish_for_type(session: Session, puzzle_type: str, target: date) -> TypeOutcome:
    outcome = TypeOutcome(puzzle_type=puzzle_type, target_date=target)

    # Idempotent: a retry, a double-fire, or a puzzle scheduled by hand all mean
    # there is nothing to do. Without this the (type, date) unique constraint
    # would turn a harmless second run into an error.
    if _published_for(session, puzzle_type, target):
        outcome.already_published = True
        outcome.buffer_remaining = len(_drafts(session, puzzle_type))
        return outcome

    drafts = _drafts(session, puzzle_type)
    if not drafts:
        # Buffer is empty — fall back to generating right now. This is the shape
        # we're trying to avoid depending on, so it's the exception path, and it
        # is worth alerting on.
        logger.warning("puzzle buffer empty for %s; generating on demand", puzzle_type)
        try:
            drafts = [_generate_draft(session, puzzle_type)]
            outcome.generated += 1
        except Exception as exc:  # noqa: BLE001 — must not abort the other type
            outcome.errors.append(f"buffer empty and generation failed: {exc}")
            logger.exception("on-demand generation failed for %s", puzzle_type)
            return outcome

    outcome.published_puzzle_id = _publish(session, drafts[0], target).id

    # Top the buffer back up. Failures here are logged but don't fail the run:
    # tomorrow's puzzle is already live, which was the job.
    shortfall = max(0, BUFFER_TARGET - len(_drafts(session, puzzle_type)))
    for _ in range(min(shortfall, MAX_GENERATE_PER_RUN)):
        try:
            _generate_draft(session, puzzle_type)
            outcome.generated += 1
        except Exception as exc:  # noqa: BLE001
            outcome.errors.append(f"buffer top-up failed: {exc}")
            logger.exception("buffer top-up failed for %s", puzzle_type)
            break

    outcome.buffer_remaining = len(_drafts(session, puzzle_type))
    return outcome


def publish_next_day(session: Session, today: Optional[date] = None) -> list[TypeOutcome]:
    """Publish tomorrow's puzzle for every type, then refill the buffer.

    Each type is handled independently so a failure in one doesn't cost the
    other its puzzle.
    """
    target = next_puzzle_date(today)
    return [publish_for_type(session, t, target) for t in PUZZLE_TYPES]
