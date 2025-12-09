from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List

from .models import PuzzleResult

DEFAULT_FALLBACK_POINTS = 1


def assign_daily_points(
    results: Iterable[PuzzleResult],
    points_table: List[int],
    fallback: int = DEFAULT_FALLBACK_POINTS,
) -> Dict[int, int]:
    """
    Given a collection of results for a single puzzle date, return a mapping
    of player_id -> awarded points. Honors points_override when provided.
    """
    awarded: Dict[int, int] = {}
    ordered = sorted(results, key=lambda r: (r.seconds, r.recorded_at, r.player_id))

    last_seconds = None
    rank = -1
    for index, result in enumerate(ordered):
        if result.points_override is not None:
            awarded[result.player_id] = result.points_override
            continue

        if result.seconds != last_seconds:
            rank = index
            last_seconds = result.seconds

        points = points_table[rank] if rank < len(points_table) else fallback
        awarded[result.player_id] = points

    return awarded


def group_results_by_date(results: Iterable[PuzzleResult]) -> Dict[date, List[PuzzleResult]]:
    grouped: Dict[date, List[PuzzleResult]] = defaultdict(list)
    for result in results:
        grouped[result.puzzle_date].append(result)
    return grouped

