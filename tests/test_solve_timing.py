from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app import auth, database
from app.models import Puzzle, SolveAttempt, User
from app.routers.puzzles import _HEARTBEAT_CAP_SECONDS, _accrue_active_time
from app.server import create_app


# --- unit tests for the accrual helper ------------------------------------


def test_accrue_first_tick_sets_baseline_no_time():
    a = SolveAttempt(user_id=1, puzzle_id=1, seconds=0, last_tick_at=None)
    now = datetime(2025, 1, 1, 12, 0, 0)
    _accrue_active_time(a, now)
    assert a.seconds == 0
    assert a.last_tick_at == now


def test_accrue_normal_gap_counts_fully():
    base = datetime(2025, 1, 1, 12, 0, 0)
    a = SolveAttempt(user_id=1, puzzle_id=1, seconds=10, last_tick_at=base)
    _accrue_active_time(a, base + timedelta(seconds=2))
    assert a.seconds == 12


def test_accrue_large_gap_is_capped():
    base = datetime(2025, 1, 1, 12, 0, 0)
    a = SolveAttempt(user_id=1, puzzle_id=1, seconds=10, last_tick_at=base)
    # Simulate the tab being closed for two minutes.
    _accrue_active_time(a, base + timedelta(seconds=120))
    assert a.seconds == 10 + _HEARTBEAT_CAP_SECONDS


def test_accrue_accumulates_across_ticks():
    base = datetime(2025, 1, 1, 12, 0, 0)
    a = SolveAttempt(user_id=1, puzzle_id=1, seconds=0, last_tick_at=base)
    for i in range(1, 6):
        _accrue_active_time(a, base + timedelta(seconds=2 * i))
    assert a.seconds == 10  # five 2-second ticks


# --- integration test for the endpoints -----------------------------------


@pytest.fixture()
def client_and_engine():
    tmp = tempfile.mktemp(suffix=".db")
    engine = create_engine(f"sqlite:///{tmp}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    def osess():
        with Session(engine) as s:
            yield s

    with Session(engine) as s:
        u = User(google_id="g1", email="a@x.com", display_name="A", handle="a")
        s.add(u)
        # 1x3 across word "CAT"
        cells = [[{"letter": "C", "is_black": False},
                  {"letter": "A", "is_black": False},
                  {"letter": "T", "is_black": False}]]
        puz = Puzzle(
            puzzle_type="mini_5x5", puzzle_date=datetime(2025, 1, 1).date(), size=3,
            grid_data=json.dumps({"cells": cells}),
            clues_data=json.dumps({"across": [], "down": []}),
            status="published",
        )
        s.add(u); s.add(puz); s.commit(); s.refresh(u); s.refresh(puz)
        uid, pid = u.id, puz.id

    app = create_app()
    app.dependency_overrides[database.get_session] = osess
    app.dependency_overrides[auth.get_current_user] = lambda: _get_user(engine, uid)
    return TestClient(app), engine, pid


def _get_user(engine, uid):
    with Session(engine) as s:
        return s.get(User, uid)


def test_submit_records_accumulated_active_time_not_wallclock(client_and_engine):
    client, engine, pid = client_and_engine
    r = client.post(f"/puzzles/{pid}/start")
    assert r.status_code == 201

    # Force the attempt's baseline to 3s ago, then heartbeat -> +3s active.
    with Session(engine) as s:
        att = s.exec(__import__("sqlmodel").select(SolveAttempt)).first()
        att.last_tick_at = datetime.utcnow() - timedelta(seconds=3)
        s.add(att); s.commit()

    grid = json.dumps({"cells": [[{"letter": "C"}, {"letter": "A"}, {"letter": "T"}]]})
    client.post(f"/puzzles/{pid}/save", json={"grid_state": grid})

    # Simulate the tab being closed a long time before submitting.
    with Session(engine) as s:
        att = s.exec(__import__("sqlmodel").select(SolveAttempt)).first()
        att.last_tick_at = datetime.utcnow() - timedelta(seconds=600)
        s.add(att); s.commit()

    r = client.post(f"/puzzles/{pid}/submit", json={"grid_state": grid})
    body = r.json()
    assert body["correct"] is True
    # ~3s (heartbeat) + capped 5s (the long pre-submit gap) — NOT 600+ wall clock.
    assert body["seconds"] <= 3 + _HEARTBEAT_CAP_SECONDS + 1
    assert body["seconds"] >= 3
