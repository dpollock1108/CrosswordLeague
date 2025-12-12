from __future__ import annotations

from datetime import date

from app.schemas import BulkPuzzleResultCreate, PuzzleResultCreate
from app.services import calculate_leaderboard, create_player, store_results


def test_leaderboard_totals_and_sorting(in_memory_session):
    # Create players
    p1 = create_player(in_memory_session, payload=create_player_payload("Alice"))
    p2 = create_player(in_memory_session, payload=create_player_payload("Bob"))
    p3 = create_player(in_memory_session, payload=create_player_payload("Charlie"))

    results_payload = BulkPuzzleResultCreate(
        overwrite_existing=True,
        results=[
            PuzzleResultCreate(player_id=p1.id, puzzle_date=date(2025, 1, 1), seconds=30),
            PuzzleResultCreate(player_id=p2.id, puzzle_date=date(2025, 1, 1), seconds=35),
            PuzzleResultCreate(player_id=p3.id, puzzle_date=date(2025, 1, 1), seconds=40),
            PuzzleResultCreate(player_id=p1.id, puzzle_date=date(2025, 1, 2), seconds=25),
            PuzzleResultCreate(player_id=p2.id, puzzle_date=date(2025, 1, 2), seconds=40),
        ],
    )

    store_results(in_memory_session, results_payload)

    leaderboard = calculate_leaderboard(
        session=in_memory_session,
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
    )

    assert leaderboard.entries[0].player_id == p1.id
    assert leaderboard.entries[0].total_points > leaderboard.entries[1].total_points
    assert leaderboard.entries[-1].player_id == p3.id
    assert leaderboard.entries[-1].puzzles_played == 1


def create_player_payload(name: str):
    from app.schemas import PlayerCreate

    return PlayerCreate(name=name)
