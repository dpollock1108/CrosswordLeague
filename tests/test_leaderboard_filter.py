from __future__ import annotations

from datetime import date

from app.schemas import BulkPuzzleResultCreate, PlayerCreate, PuzzleResultCreate
from app.services import calculate_leaderboard, create_player, store_results


def _seed(session):
    pa = create_player(session, PlayerCreate(name="Alice"))
    pb = create_player(session, PlayerCreate(name="Bob"))
    store_results(
        session,
        BulkPuzzleResultCreate(
            overwrite_existing=True,
            results=[
                # Alice plays a legacy NYT mini and a hosted medium
                PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 1), seconds=30, puzzle_type="nyt_mini"),
                PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 2), seconds=80, puzzle_type="medium_10x10"),
                # Bob plays a hosted mini only
                PuzzleResultCreate(player_id=pb.id, puzzle_date=date(2025, 1, 1), seconds=50, puzzle_type="mini_5x5"),
            ],
        ),
    )
    return pa, pb


def test_no_filter_includes_all_types(in_memory_session):
    pa, pb = _seed(in_memory_session)
    board = calculate_leaderboard(in_memory_session, date(2025, 1, 1), date(2025, 1, 2))
    by_id = {e.player_id: e for e in board.entries}
    assert set(by_id) == {pa.id, pb.id}
    assert by_id[pa.id].puzzles_played == 2  # both of Alice's puzzles


def test_mini_group_includes_legacy_and_hosted(in_memory_session):
    pa, pb = _seed(in_memory_session)
    board = calculate_leaderboard(
        in_memory_session, date(2025, 1, 1), date(2025, 1, 2),
        puzzle_types=["nyt_mini", "mini_5x5"],
    )
    by_id = {e.player_id: e for e in board.entries}
    # Alice's medium is excluded -> only her nyt_mini counts
    assert by_id[pa.id].puzzles_played == 1
    assert by_id[pb.id].puzzles_played == 1


def test_medium_filter_excludes_minis(in_memory_session):
    pa, pb = _seed(in_memory_session)
    board = calculate_leaderboard(
        in_memory_session, date(2025, 1, 1), date(2025, 1, 2),
        puzzle_types=["medium_10x10"],
    )
    ids = {e.player_id for e in board.entries}
    assert ids == {pa.id}  # only Alice has a medium result
