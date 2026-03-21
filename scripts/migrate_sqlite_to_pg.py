"""
One-off migration from local SQLite (crossword.db) to a Postgres database (e.g., RDS).

Usage:
  uv run python scripts/migrate_sqlite_to_pg.py \
    --source sqlite:///./crossword.db \
    --target postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME

Notes:
- Run with the app stopped to avoid new writes during migration.
- Preserves IDs to keep uniqueness and relationships intact.
- Requires psycopg installed (included in the Dockerfile; install locally if needed: `pip install psycopg[binary]`).
"""

from __future__ import annotations

import argparse

from sqlmodel import Session, create_engine, select

# Ensure repository root is on sys.path when running as a script
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import init_db
from app.models import Player, PuzzleResult


def migrate(source_url: str, target_url: str) -> None:
    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url, echo=False)

    # Ensure target tables exist
    init_db()

    with Session(source_engine) as src, Session(target_engine) as dst:
        players = src.exec(select(Player)).all()
        results = src.exec(select(PuzzleResult)).all()

        print(f"Copying {len(players)} players and {len(results)} results with upserts...")
        for p in players:
            # Upsert player by id
            existing = dst.get(Player, p.id)
            if existing:
                for field, value in p.model_dump().items():
                    setattr(existing, field, value)
                dst.add(existing)
            else:
                dst.add(Player(**p.model_dump()))

        # Preload existing results by (player_id, puzzle_date) to skip/overwrite
        existing_results = {
            (r.player_id, r.puzzle_date): r
            for r in dst.exec(select(PuzzleResult)).all()
        }
        for r in results:
            key = (r.player_id, r.puzzle_date)
            if key in existing_results:
                existing = existing_results[key]
                for field, value in r.model_dump().items():
                    setattr(existing, field, value)
                dst.add(existing)
            else:
                dst.add(PuzzleResult(**r.model_dump()))

        dst.commit()

    print("Migration complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate data from SQLite to Postgres.")
    parser.add_argument("--source", default="sqlite:///./crossword.db", help="Source DB URL (default: sqlite:///./crossword.db)")
    parser.add_argument("--target", required=True, help="Target Postgres URL (postgresql+psycopg://...)")
    args = parser.parse_args()
    migrate(args.source, args.target)
