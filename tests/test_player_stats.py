from __future__ import annotations

from datetime import date

from app.schemas import PuzzleResultCreate
from app.services import build_player_stats, create_player, store_results


def test_player_stats_weekday_averages(in_memory_session):
    player = create_player(in_memory_session, create_player_payload("Dana"))
    payload = [
        PuzzleResultCreate(player_id=player.id, puzzle_date=date(2025, 1, 6), seconds=50),  # Monday
        PuzzleResultCreate(player_id=player.id, puzzle_date=date(2025, 1, 7), seconds=35),  # Tuesday
        PuzzleResultCreate(player_id=player.id, puzzle_date=date(2025, 1, 14), seconds=45),  # Next Tuesday
    ]
    store_results(in_memory_session, payload=create_bulk_payload(payload))

    stats = build_player_stats(in_memory_session, player.id)

    assert stats
    assert stats.weekday_averages
    assert abs(stats.weekday_averages["Tuesday"] - 40) < 0.001
    assert stats.best_day_of_week == "Tuesday"


def create_player_payload(name: str):
    from app.schemas import PlayerCreate

    return PlayerCreate(name=name)


def create_bulk_payload(results):
    from app.schemas import BulkPuzzleResultCreate

    return BulkPuzzleResultCreate(results=results, overwrite_existing=True)
