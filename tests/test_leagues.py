from __future__ import annotations

from datetime import date

from app.league_service import (
    LeagueError,
    approve_request,
    create_league,
    deny_request,
    get_league_members,
    get_pending_requests,
    is_active_member,
    join_league,
    league_member_player_ids,
    list_user_leagues,
    set_visibility,
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


def test_create_and_join_public_league(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    league = create_league(in_memory_session, "Test League", alice, visibility="public")
    assert league.invite_code
    assert len(league.invite_code) == 8
    assert league.visibility == "public"

    # creator is admin and only member
    leagues = list_user_leagues(in_memory_session, alice)
    assert len(leagues) == 1
    _, membership, count = leagues[0]
    assert membership.role == "admin"
    assert membership.status == "active"
    assert count == 1

    # bob joins a public league -> active immediately
    joined, join_status = join_league(in_memory_session, league.invite_code, bob)
    assert joined.id == league.id
    assert join_status == "active"
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

    league = create_league(in_memory_session, "Friends", alice, visibility="public")
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


def test_private_league_requires_approval(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    league = create_league(in_memory_session, "Secret", alice)  # default private
    assert league.visibility == "private"

    # Bob requests to join -> pending, not active
    _, join_status = join_league(in_memory_session, league.invite_code, bob)
    assert join_status == "pending"
    assert not is_active_member(in_memory_session, league.id, bob.id)

    # Bob does not count as a member yet
    assert len(get_league_members(in_memory_session, league.id)) == 1
    pending = get_pending_requests(in_memory_session, league.id)
    assert [p.user_id for p in pending] == [bob.id]

    # Re-requesting while pending errors
    try:
        join_league(in_memory_session, league.invite_code, bob)
        assert False, "expected LeagueError"
    except LeagueError:
        pass

    # Admin approves -> Bob becomes active
    approve_request(in_memory_session, league.id, bob.id)
    assert is_active_member(in_memory_session, league.id, bob.id)
    assert len(get_league_members(in_memory_session, league.id)) == 2
    assert get_pending_requests(in_memory_session, league.id) == []


def test_deny_request_removes_pending(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    league = create_league(in_memory_session, "Secret", alice)
    join_league(in_memory_session, league.invite_code, bob)

    deny_request(in_memory_session, league.id, bob.id)
    assert not is_active_member(in_memory_session, league.id, bob.id)
    assert get_pending_requests(in_memory_session, league.id) == []
    # Denied user can request again
    _, join_status = join_league(in_memory_session, league.invite_code, bob)
    assert join_status == "pending"


def test_switching_to_public_auto_approves_pending(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    league = create_league(in_memory_session, "Secret", alice)
    join_league(in_memory_session, league.invite_code, bob)
    assert not is_active_member(in_memory_session, league.id, bob.id)

    set_visibility(in_memory_session, league, "public")
    assert league.visibility == "public"
    assert is_active_member(in_memory_session, league.id, bob.id)
    assert get_pending_requests(in_memory_session, league.id) == []


def test_rename_and_remove_member_and_delete(in_memory_session):
    from app.league_service import (
        delete_league,
        get_league_members,
        remove_member,
        rename_league,
        set_scoring_config,
    )
    from app.models import League, LeagueMembership, LeagueScoringConfig
    from sqlmodel import select

    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    league = create_league(in_memory_session, "Old Name", alice, visibility="public")
    join_league(in_memory_session, league.invite_code, bob)
    set_scoring_config(in_memory_session, league.id,
                       mini_tiers=[(None, 1)], mini_bonus=1,
                       medium_tiers=[(None, 1)], medium_bonus=1)

    # rename
    rename_league(in_memory_session, league, "New Name")
    assert in_memory_session.get(League, league.id).name == "New Name"

    # remove bob
    remove_member(in_memory_session, league.id, bob.id)
    members = get_league_members(in_memory_session, league.id)
    assert [m.user_id for m in members] == [alice.id]

    # delete league cascades memberships + scoring config
    lid = league.id
    delete_league(in_memory_session, lid)
    assert in_memory_session.get(League, lid) is None
    assert in_memory_session.exec(
        select(LeagueMembership).where(LeagueMembership.league_id == lid)
    ).all() == []
    assert in_memory_session.exec(
        select(LeagueScoringConfig).where(LeagueScoringConfig.league_id == lid)
    ).first() is None
