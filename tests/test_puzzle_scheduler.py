"""Tests for the unattended next-day publish job.

The job's whole justification is that it keeps working unattended, so most of
these cover the ways it can go wrong rather than the happy path.
"""
from __future__ import annotations

import json
from datetime import date, timedelta

import pytest
from sqlmodel import Session, select

from app import puzzle_scheduler as sched
from app.models import Puzzle

TODAY = date(2026, 3, 1)
TOMORROW = TODAY + timedelta(days=1)


def make_draft(session: Session, puzzle_type: str = "mini_5x5", created_at=None) -> Puzzle:
    """An unassigned draft sitting in the repository buffer."""
    p = Puzzle(
        puzzle_type=puzzle_type,
        puzzle_date=None,
        size=sched.SIZE_FOR_TYPE[puzzle_type],
        grid_data=json.dumps({"cells": []}),
        clues_data=json.dumps({"across": [], "down": []}),
        status="draft",
        created_by="ai",
    )
    if created_at is not None:
        p.created_at = created_at
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@pytest.fixture()
def no_generation(monkeypatch):
    """Fail any generation attempt, so tests must rely on the buffer."""
    def boom(*a, **k):
        raise RuntimeError("generation should not have been called")
    monkeypatch.setattr(sched, "_generate_draft", boom)


@pytest.fixture()
def counting_generation(monkeypatch):
    """Record generation calls and produce a draft without touching the API."""
    calls: list[str] = []

    def fake(session, puzzle_type):
        calls.append(puzzle_type)
        return make_draft(session, puzzle_type)

    monkeypatch.setattr(sched, "_generate_draft", fake)
    return calls


# --- the date the job targets ---------------------------------------------


def test_next_puzzle_date_is_tomorrow():
    assert sched.next_puzzle_date(TODAY) == TOMORROW


# --- happy path -----------------------------------------------------------


def test_publishes_from_the_buffer(in_memory_session, counting_generation):
    draft = make_draft(in_memory_session, "mini_5x5")

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert out.ok
    assert out.published_puzzle_id == draft.id
    in_memory_session.refresh(draft)
    assert draft.puzzle_date == TOMORROW
    assert draft.status == "published"
    assert draft.published_at is not None


def test_publishes_the_oldest_draft_first(in_memory_session, counting_generation):
    from datetime import datetime

    older = make_draft(in_memory_session, "mini_5x5", created_at=datetime(2026, 1, 1))
    make_draft(in_memory_session, "mini_5x5", created_at=datetime(2026, 2, 1))

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert out.published_puzzle_id == older.id


def test_tops_the_buffer_back_up(in_memory_session, counting_generation):
    make_draft(in_memory_session, "mini_5x5")

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    # One draft was consumed, so the run generates up to its per-run cap.
    assert out.generated == sched.MAX_GENERATE_PER_RUN
    assert counting_generation == ["mini_5x5"] * sched.MAX_GENERATE_PER_RUN


# --- idempotency ----------------------------------------------------------


def test_second_run_is_a_no_op(in_memory_session, counting_generation):
    make_draft(in_memory_session, "mini_5x5")
    sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    again = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert again.already_published
    assert again.published_puzzle_id is None
    assert again.ok
    # Crucially it does not publish a second puzzle for the same date, which
    # the (puzzle_type, puzzle_date) unique constraint would reject anyway.
    scheduled = in_memory_session.exec(
        select(Puzzle).where(Puzzle.puzzle_type == "mini_5x5", Puzzle.puzzle_date == TOMORROW)
    ).all()
    assert len(scheduled) == 1


def test_leaves_a_hand_scheduled_puzzle_alone(in_memory_session, no_generation):
    manual = make_draft(in_memory_session, "mini_5x5")
    manual.puzzle_date = TOMORROW
    manual.status = "published"
    in_memory_session.add(manual)
    in_memory_session.commit()

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert out.already_published
    in_memory_session.refresh(manual)
    assert manual.id == manual.id and manual.puzzle_date == TOMORROW


# --- failure modes --------------------------------------------------------


def test_empty_buffer_falls_back_to_generating(in_memory_session, counting_generation):
    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert out.ok
    assert out.published_puzzle_id is not None
    assert counting_generation[0] == "mini_5x5"


def test_empty_buffer_and_failing_generation_reports_not_ok(in_memory_session, monkeypatch):
    def boom(session, puzzle_type):
        raise RuntimeError("anthropic is down")
    monkeypatch.setattr(sched, "_generate_draft", boom)

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert not out.ok
    assert out.published_puzzle_id is None
    assert "anthropic is down" in out.errors[0]


def test_top_up_failure_does_not_fail_the_run(in_memory_session, monkeypatch):
    """Tomorrow's puzzle is already live at that point; the buffer can wait."""
    make_draft(in_memory_session, "mini_5x5")

    def boom(session, puzzle_type):
        raise RuntimeError("solver timed out")
    monkeypatch.setattr(sched, "_generate_draft", boom)

    out = sched.publish_for_type(in_memory_session, "mini_5x5", TOMORROW)

    assert out.ok  # the important part still happened
    assert out.published_puzzle_id is not None
    assert out.errors and "solver timed out" in out.errors[0]


def test_one_type_failing_does_not_starve_the_other(in_memory_session, monkeypatch):
    # Only the mini has a draft; generation fails outright.
    make_draft(in_memory_session, "mini_5x5")

    def boom(session, puzzle_type):
        raise RuntimeError("nope")
    monkeypatch.setattr(sched, "_generate_draft", boom)

    outcomes = sched.publish_next_day(in_memory_session, today=TODAY)

    by_type = {o.puzzle_type: o for o in outcomes}
    assert by_type["mini_5x5"].ok           # published from its buffer
    assert not by_type["medium_9x9"].ok     # no buffer, generation failed
    assert len(outcomes) == len(sched.PUZZLE_TYPES)


# --- both types together --------------------------------------------------


def test_publishes_every_type(in_memory_session, counting_generation):
    for t in sched.PUZZLE_TYPES:
        make_draft(in_memory_session, t)

    outcomes = sched.publish_next_day(in_memory_session, today=TODAY)

    assert all(o.ok for o in outcomes)
    for t in sched.PUZZLE_TYPES:
        live = in_memory_session.exec(
            select(Puzzle).where(Puzzle.puzzle_type == t, Puzzle.puzzle_date == TOMORROW)
        ).first()
        assert live is not None and live.status == "published"


# --- the HTTP endpoint the scheduler actually calls ------------------------


def test_cron_endpoint_requires_admin(monkeypatch):
    """An unauthenticated caller must not be able to burn AI credits."""
    from fastapi.testclient import TestClient
    from app.server import create_app

    monkeypatch.setattr("app.config.settings.disable_admin_auth", False)
    client = TestClient(create_app())
    assert client.post("/api/puzzles/cron/publish-next").status_code == 401


def test_cron_endpoint_publishes_and_reports(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from sqlmodel import SQLModel, create_engine
    from app import database
    from app.server import create_app

    engine = create_engine(f"sqlite:///{tmp_path}/cron.db", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    monkeypatch.setattr(sched, "_generate_draft", lambda s, t: make_draft(s, t))
    monkeypatch.setattr("app.config.settings.disable_admin_auth", True)

    app = create_app()
    app.dependency_overrides[database.get_session] = override
    client = TestClient(app)

    body = client.post("/api/puzzles/cron/publish-next").json()

    assert body["ok"] is True
    assert {r["puzzle_type"] for r in body["results"]} == set(sched.PUZZLE_TYPES)
    assert all(r["published_puzzle_id"] for r in body["results"])

    # Idempotent over HTTP too — a Scheduler retry must not double-publish.
    again = client.post("/api/puzzles/cron/publish-next").json()
    assert again["ok"] is True
    assert all(r["already_published"] for r in again["results"])
