from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Optional, Tuple

from .models import PuzzleResult

# A scoring tier is (max_seconds, points): finish in <= max_seconds to earn
# points. max_seconds=None is the catch-all for anyone slower.
Tier = Tuple[Optional[int], int]

# Puzzle-type -> scoring category. Legacy NYT minis count as "mini".
_MINI_TYPES = {"nyt_mini", "mini_5x5"}


def category_for(puzzle_type: str) -> str:
    """Map a puzzle_type to its scoring category ('mini' or 'medium')."""
    return "mini" if puzzle_type in _MINI_TYPES else "medium"


# Default tier table — mirrors the original fixed scoring. Used for the global
# path and for any league/category that hasn't customized its scoring.
DEFAULT_TIERS: List[Tier] = [(30, 5), (59, 4), (89, 3), (119, 2), (None, 1)]
DEFAULT_BONUS = 1


def sort_tiers(tiers: List[Tier]) -> List[Tier]:
    """Ascending by max_seconds, with the catch-all (None) last."""
    return sorted(tiers, key=lambda t: (t[0] is None, t[0] if t[0] is not None else 0))


def points_for_tiers(seconds: int, tiers: List[Tier]) -> int:
    """Points for a finish time given a (pre-sorted) tier table."""
    for max_seconds, points in tiers:
        if max_seconds is None or seconds <= max_seconds:
            return points
    return 0  # slower than every tier and no catch-all


def _time_points(seconds: int) -> int:
    if seconds <= 30:
        return 5
    if seconds < 60:
        return 4
    if seconds < 90:
        return 3
    if seconds < 120:
        return 2
    return 1


def assign_daily_points(
    results: Iterable[PuzzleResult],
) -> Dict[int, int]:
    awarded: Dict[int, int] = {}
    ordered = sorted(results, key=lambda r: (r.seconds, r.recorded_at, r.player_id))
    if not ordered:
        return awarded

    best_time = ordered[0].seconds
    for result in ordered:
        if result.points_override is not None:
            awarded[result.player_id] = result.points_override
            continue
        base = _time_points(result.seconds)
        bonus = 1 if result.seconds == best_time else 0
        awarded[result.player_id] = base + bonus

    return awarded


def group_results_by_date(results: Iterable[PuzzleResult]) -> Dict[date, List[PuzzleResult]]:
    grouped: Dict[date, List[PuzzleResult]] = defaultdict(list)
    for result in results:
        grouped[result.puzzle_date].append(result)
    return grouped
