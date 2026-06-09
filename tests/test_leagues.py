from __future__ import annotations

from datetime import date

from app.league_service import (
    LeagueError,
    create_league,
    join_league,
    league_member_player_ids,
    list_user_leagues,
)
from app.models import User
from app.schemas import BulkPuzzleResultCreate, PlayerCreate, PuzzleResultCreate
from app.services import calculate_leaderboard, create_player, store_results


def _make_user(session, name, player_id=None):
    user = User(
        google_id=f"g-{name}",
        email=f"{name}@example.com",
        display_name=name,
        handle=name,
        player_id=player_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_create_and_join_league(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    league = create_league(in_memory_session, "Test League", alice)
    assert league.invite_code
    assert len(league.invite_code) == 8

    # creator is admin and only member
    leagues = list_user_leagues(in_memory_session, alice)
    assert len(leagues) == 1
    _, role, count = leagues[0]
    assert role == "admin"
    assert count == 1

    # bob joins
    joined = join_league(in_memory_session, league.invite_code, bob)
    assert joined.id == league.id
    _, _, count = list_user_leagues(in_memory_session, bob)[0]
    assert count == 2


def test_join_errors(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    league = create_league(in_memory_session, "L", alice)

    # bad code
    try:
        join_league(in_memory_session, "BADCODE0", alice)
        assert False, "expected LeagueError"
    except LeagueError:
        pass

    # double join
    try:
        join_league(in_memory_session, league.invite_code, alice)
        assert False, "expected LeagueError"
    except LeagueError:
        pass


def test_league_leaderboard_scopes_to_members(in_memory_session):
    # three players; only two are in the league
    pa = create_player(in_memory_session, PlayerCreate(name="Alice"))
    pb = create_player(in_memory_session, PlayerCreate(name="Bob"))
    pc = create_player(in_memory_session, PlayerCreate(name="Carol"))

    alice = _make_user(in_memory_session, "alice", player_id=pa.id)
    bob = _make_user(in_memory_session, "bob", player_id=pb.id)
    _make_user(in_memory_session, "carol", player_id=pc.id)

    league = create_league(in_memory_session, "Friends", alice)
    join_league(in_memory_session, league.invite_code, bob)

    # Carol is fastest overall but NOT in the league.
    store_results(
        in_memory_session,
        BulkPuzzleResultCreate(
            overwrite_existing=True,
            results=[
                PuzzleResultCreate(player_id=pc.id, puzzle_date=date(2025, 1, 1), seconds=20),
                PuzzleResultCreate(player_id=pa.id, puzzle_date=date(2025, 1, 1), seconds=30),
                PuzzleResultCreate(player_id=pb.id, puzzle_date=date(2025, 1, 1), seconds=45),
            ],
        ),
    )

    member_ids = league_member_player_ids(in_memory_session, league.id)
    assert member_ids == {pa.id, pb.id}

    board = calculate_leaderboard(
        in_memory_session, date(2025, 1, 1), date(2025, 1, 1), player_ids=member_ids
    )
    ids = {e.player_id for e in board.entries}
    assert ids == {pa.id, pb.id}  # Carol excluded

    # Alice is fastest *within the league* -> gets first-place bonus.
    # 30s -> base 5 (<=30 tier) + 1 league bonus = 6
    alice_entry = next(e for e in board.entries if e.player_id == pa.id)
    assert alice_entry.total_points == 6
    assert board.entries[0].player_id == pa.id
