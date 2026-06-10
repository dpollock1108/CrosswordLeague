from __future__ import annotations

from datetime import date

import pytest

from app.league_service import (
    LeagueError,
    create_league,
    get_scoring_config,
    set_scoring_config,
)
from app.models import User
from app.schemas import BulkPuzzleResultCreate, PlayerCreate, PuzzleResultCreate
from app.scoring import DEFAULT_BONUS, DEFAULT_TIERS, category_for, points_for_tiers, sort_tiers
from app.services import calculate_leaderboard, create_player, store_results


# --- pure scoring helpers --------------------------------------------------


def test_points_for_tiers_basic():
    tiers = sort_tiers([(None, 1), (30, 5), (60, 3)])
    assert points_for_tiers(20, tiers) == 5
    assert points_for_tiers(30, tiers) == 5
    assert points_for_tiers(45, tiers) == 3
    assert points_for_tiers(999, tiers) == 1  # catch-all


def test_points_for_tiers_no_catchall_returns_zero():
    tiers = [(30, 5)]
    assert points_for_tiers(20, tiers) == 5
    assert points_for_tiers(40, tiers) == 0


def test_category_for():
    assert category_for("nyt_mini") == "mini"
    assert category_for("mini_5x5") == "mini"
    assert category_for("medium_10x10") == "medium"


# --- config persistence ----------------------------------------------------


def _user(session, name):
    u = User(google_id=f"g-{name}", email=f"{name}@x.com", display_name=name, handle=name)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def test_config_roundtrip_and_default(in_memory_session):
    alice = _user(in_memory_session, "alice")
    league = create_league(in_memory_session, "L", alice)

    # No config yet -> defaults for both categories.
    cfg = get_scoring_config(in_memory_session, league.id)
    assert cfg["mini"]["tiers"] == DEFAULT_TIERS
    assert cfg["mini"]["bonus"] == DEFAULT_BONUS

    set_scoring_config(
        in_memory_session, league.id,
        mini_tiers=[(None, 1), (10, 9)], mini_bonus=2,
        medium_tiers=[(120, 4), (None, 1)], medium_bonus=3,
    )
    cfg = get_scoring_config(in_memory_session, league.id)
    # tiers come back sorted ascending with catch-all last
    assert cfg["mini"]["tiers"] == [(10, 9), (None, 1)]
    assert cfg["mini"]["bonus"] == 2
    assert cfg["medium"]["tiers"] == [(120, 4), (None, 1)]
    assert cfg["medium"]["bonus"] == 3


def test_config_validation(in_memory_session):
    alice = _user(in_memory_session, "alice")
    league = create_league(in_memory_session, "L", alice)

    with pytest.raises(LeagueError):
        set_scoring_config(in_memory_session, league.id,
                           mini_tiers=[], mini_bonus=1,
                           medium_tiers=[(None, 1)], medium_bonus=1)
    with pytest.raises(LeagueError):  # two catch-alls
        set_scoring_config(in_memory_session, league.id,
                           mini_tiers=[(None, 1), (None, 2)], mini_bonus=1,
                           medium_tiers=[(None, 1)], medium_bonus=1)


# --- leaderboard with custom config ----------------------------------------


def test_leaderboard_uses_custom_tiers(in_memory_session):
    pa = create_player(in_memory_session, PlayerCreate(name="Alice"))
    pb = create_player(in_memory_session, PlayerCreate(name="Bob"))
    alice = _user(in_memory_session, "alice"); alice.player_id = pa.id
    league = create_league(in_memory_session, "L", alice)
    set_scoring_config(in_memory_session, league.id,
                       mini_tiers=[(10, 10), (None, 1)], mini_bonus=0,
                       medium_tiers=[(None, 1)], medium_bonus=0)

    store_results(in_memory_session, BulkPuzzleResultCreate(overwrite_existing=True, results=[
        PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 1), seconds=8, puzzle_type="mini_5x5"),
        PuzzleResultCreate(player_id=pb.id, puzzle_date=date(2025, 1, 1), seconds=15, puzzle_type="mini_5x5"),
    ]))

    board = calculate_leaderboard(
        in_memory_session, date(2025, 1, 1), date(2025, 1, 1),
        player_ids={pa.id, pb.id},
        scoring_config=get_scoring_config(in_memory_session, league.id),
    )
    pts = {e.player_id: e.total_points for e in board.entries}
    assert pts[pa.id] == 10  # 8s <= 10
    assert pts[pb.id] == 1   # catch-all


def test_per_category_first_place_bonus(in_memory_session):
    pa = create_player(in_memory_session, PlayerCreate(name="Alice"))
    pb = create_player(in_memory_session, PlayerCreate(name="Bob"))
    alice = _user(in_memory_session, "alice"); alice.player_id = pa.id
    league = create_league(in_memory_session, "L", alice)
    # zero base points so we isolate the per-category bonus
    set_scoring_config(in_memory_session, league.id,
                       mini_tiers=[(None, 0)], mini_bonus=5,
                       medium_tiers=[(None, 0)], medium_bonus=7)

    store_results(in_memory_session, BulkPuzzleResultCreate(overwrite_existing=True, results=[
        PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 1), seconds=20, puzzle_type="mini_5x5"),
        PuzzleResultCreate(player_id=pb.id, puzzle_date=date(2025, 1, 1), seconds=40, puzzle_type="mini_5x5"),
        PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 1), seconds=100, puzzle_type="medium_10x10"),
        PuzzleResultCreate(player_id=pb.id, puzzle_date=date(2025, 1, 1), seconds=90, puzzle_type="medium_10x10"),
    ]))

    board = calculate_leaderboard(
        in_memory_session, date(2025, 1, 1), date(2025, 1, 1),
        player_ids={pa.id, pb.id},
        scoring_config=get_scoring_config(in_memory_session, league.id),
    )
    pts = {e.player_id: e.total_points for e in board.entries}
    assert pts[pa.id] == 5  # fastest mini -> mini bonus; not fastest medium
    assert pts[pb.id] == 7  # fastest medium -> medium bonus; not fastest mini
