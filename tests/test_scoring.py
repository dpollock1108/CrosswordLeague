from __future__ import annotations

from datetime import date

from app.models import Player, PuzzleResult
from app.scoring import assign_daily_points, group_results_by_date


def test_assign_daily_points_handles_ties():
    results = [
        PuzzleResult(id=1, player_id=1, puzzle_date=date.today(), seconds=30),
        PuzzleResult(id=2, player_id=2, puzzle_date=date.today(), seconds=30),
        PuzzleResult(id=3, player_id=3, puzzle_date=date.today(), seconds=45),
    ]

    awarded = assign_daily_points(results, [])

    assert awarded[1] == 6  # 5 for <=30s +1 for first-place tie
    assert awarded[2] == 6
    assert awarded[3] == 4  # <60s, no bonus


def test_assign_daily_points_respects_override():
    results = [
        PuzzleResult(id=1, player_id=1, puzzle_date=date.today(), seconds=50),
        PuzzleResult(
            id=2,
            player_id=2,
            puzzle_date=date.today(),
            seconds=60,
            points_override=25,
        ),
    ]

    awarded = assign_daily_points(results, [])

    assert awarded[1] == 5  # <60s + first bonus
    assert awarded[2] == 25


def test_group_results_by_date_splits_correctly():
    d1 = date(2025, 1, 1)
    d2 = date(2025, 1, 2)
    results = [
        PuzzleResult(id=1, player_id=1, puzzle_date=d1, seconds=30),
        PuzzleResult(id=2, player_id=2, puzzle_date=d1, seconds=40),
        PuzzleResult(id=3, player_id=1, puzzle_date=d2, seconds=35),
    ]

    grouped = group_results_by_date(results)

    assert set(grouped.keys()) == {d1, d2}
    assert len(grouped[d1]) == 2
    assert len(grouped[d2]) == 1
