from __future__ import annotations

"""
Seed script to populate the database with sample players and puzzle results.

Usage:
    uv run python -m app.seed
"""

from datetime import date, timedelta
from typing import Dict, List

from sqlmodel import Session, select

from .database import engine, init_db
from .models import Player, PuzzleResult


def ensure_players(session: Session, players: List[Dict[str, str]]) -> List[Player]:
    created: List[Player] = []
    for entry in players:
        existing = session.exec(select(Player).where(Player.name == entry["name"])).one_or_none()
        if existing:
            created.append(existing)
            continue
        player = Player(**entry)
        session.add(player)
        session.commit()
        session.refresh(player)
        created.append(player)
    return created


def add_results(session: Session, players: List[Player]) -> None:
    today = date.today()
    start = today - timedelta(days=21)
    # Generate one result per day per player with varying seconds.
    for day_offset in range(0, 21):
        puzzle_date = start + timedelta(days=day_offset)
        for idx, player in enumerate(players):
            base_seconds = 40 + (idx * 5)
            delta = (day_offset * (idx + 1)) % 8
            seconds = base_seconds - delta
            existing = session.exec(
                select(PuzzleResult).where(
                    PuzzleResult.player_id == player.id,
                    PuzzleResult.puzzle_date == puzzle_date,
                ),
            ).one_or_none()
            if existing:
                continue
            session.add(
                PuzzleResult(
                    player_id=player.id,
                    puzzle_date=puzzle_date,
                    seconds=max(20, seconds),
                    note="seed",
                    source="seed-script",
                ),
            )
    session.commit()


def main() -> None:
    init_db()
    sample_players = [
        {"name": "Alice", "handle": "alice"},
        {"name": "Bob", "handle": "bob"},
        {"name": "Charlie", "handle": "charlie"},
        {"name": "Dana", "handle": "dana"},
    ]
    with Session(engine) as session:
        players = ensure_players(session, sample_players)
        add_results(session, players)
    print("Seed data added.")


if __name__ == "__main__":
    main()
