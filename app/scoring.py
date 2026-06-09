from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List

from .models import PuzzleResult


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
