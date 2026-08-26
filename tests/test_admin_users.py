"""Tests for the admin user list.

The counts are the reason this view exists — a user whose player has no results,
or no player at all, is the visible fingerprint of the legacy-linking bugs — so
they get more attention here than the plain fields do.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app import database
from app.models import League, LeagueMembership, Player, PuzzleResult, User
from app.routers.admin import list_users
from app.server import create_app


def make_user(session: Session, email: str, *, handle=None, player=None, created=None, admin=False) -> User:
    u = User(
        google_id=f"g-{email}",
        email=email,
        display_name=email.split("@")[0],
        handle=handle,
        player_id=player.id if player else None,
        is_admin=admin,
    )
    if created is not None:
        u.created_at = created
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def make_player(session: Session, name: str, handle=None) -> Player:
    p = Player(name=name, handle=handle)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def add_result(session: Session, player: Player, day: date) -> None:
    session.add(
        PuzzleResult(player_id=player.id, puzzle_date=day, puzzle_type="mini_5x5", seconds=42, source="test")
    )
    session.commit()


def test_lists_users_oldest_first(in_memory_session):
    make_user(in_memory_session, "b@x.com", created=datetime(2026, 2, 1))
    make_user(in_memory_session, "a@x.com", created=datetime(2026, 1, 1))

    rows = list_users(session=in_memory_session, _=None)

    assert [r.email for r in rows] == ["a@x.com", "b@x.com"]


def test_includes_linked_player_and_result_count(in_memory_session):
    player = make_player(in_memory_session, "Delp", handle="delp")
    make_user(in_memory_session, "d@x.com", handle="delp", player=player)
    for i in range(3):
        add_result(in_memory_session, player, date(2026, 1, 1) + timedelta(days=i))

    row = list_users(session=in_memory_session, _=None)[0]

    assert row.player_id == player.id
    assert row.player_name == "Delp"
    assert row.player_handle == "delp"
    assert row.result_count == 3


def test_user_with_no_player_reports_zero_rather_than_failing(in_memory_session):
    """The exact shape bug #3 leaves behind — must not blow up the whole page."""
    make_user(in_memory_session, "orphan@x.com")

    row = list_users(session=in_memory_session, _=None)[0]

    assert row.player_id is None
    assert row.player_name is None
    assert row.result_count == 0


def test_results_are_attributed_to_the_right_user(in_memory_session):
    """A single shared count dict is easy to get subtly wrong; pin it down."""
    busy = make_player(in_memory_session, "Busy")
    idle = make_player(in_memory_session, "Idle")
    make_user(in_memory_session, "busy@x.com", player=busy, created=datetime(2026, 1, 1))
    make_user(in_memory_session, "idle@x.com", player=idle, created=datetime(2026, 1, 2))
    add_result(in_memory_session, busy, date(2026, 1, 1))
    add_result(in_memory_session, busy, date(2026, 1, 2))

    by_email = {r.email: r for r in list_users(session=in_memory_session, _=None)}

    assert by_email["busy@x.com"].result_count == 2
    assert by_email["idle@x.com"].result_count == 0


def test_league_count_excludes_pending_requests(in_memory_session):
    u = make_user(in_memory_session, "j@x.com")
    league_a = League(name="A", invite_code="aaa", creator_id=u.id)
    league_b = League(name="B", invite_code="bbb", creator_id=u.id)
    in_memory_session.add(league_a)
    in_memory_session.add(league_b)
    in_memory_session.commit()
    in_memory_session.refresh(league_a)
    in_memory_session.refresh(league_b)
    in_memory_session.add(LeagueMembership(league_id=league_a.id, user_id=u.id, status="active"))
    in_memory_session.add(LeagueMembership(league_id=league_b.id, user_id=u.id, status="pending"))
    in_memory_session.commit()

    row = list_users(session=in_memory_session, _=None)[0]

    assert row.league_count == 1  # the pending request doesn't count


# --- the endpoint ---------------------------------------------------------


@pytest.fixture()
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/admin.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    app = create_app()
    app.dependency_overrides[database.get_session] = override
    with Session(engine) as s:
        make_user(s, "someone@x.com", handle="someone")
    return TestClient(app), engine


def test_endpoint_requires_admin(client, monkeypatch):
    c, _ = client
    monkeypatch.setattr("app.config.settings.disable_admin_auth", False)
    assert c.get("/api/admin/users").status_code == 401


def test_endpoint_returns_rows_for_an_admin(client, monkeypatch):
    c, _ = client
    monkeypatch.setattr("app.config.settings.disable_admin_auth", True)

    body = c.get("/api/admin/users").json()

    assert len(body) == 1
    assert body[0]["email"] == "someone@x.com"
    assert body[0]["handle"] == "someone"
    assert body[0]["result_count"] == 0
