"""baseline schema

Revision ID: 975e29677dfd
Revises:
Create Date: 2026-05-31 13:18:04.012606

Creates the two original tables (player, puzzle_results) and their indexes.

Historically this migration only created one index, because every database that
existed at the time had already been built by SQLModel's create_all() and the
tables were simply assumed to be there. That assumption made `alembic upgrade
head` impossible to run against an empty database, and it also broke against a
create_all()-built Postgres database, where the index it wanted to create was
already present.

So each step here is guarded: create only what is missing. That makes the
migration correct from zero AND a no-op on a database that create_all() already
populated, which is what the production database looks like.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '975e29677dfd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_index(table: str, name: str) -> bool:
    if not _has_table(table):
        return False
    return name in {ix["name"] for ix in _inspector().get_indexes(table)}


def _has_constraint(table: str, name: str) -> bool:
    if not _has_table(table):
        return False
    insp = _inspector()
    names = {c["name"] for c in insp.get_unique_constraints(table)}
    pk = insp.get_pk_constraint(table)
    if pk and pk.get("name"):
        names.add(pk["name"])
    return name in names


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table("player"):
        op.create_table(
            "player",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("handle", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("nyt_username", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="player_pkey"),
        )

    if not _has_table("puzzle_results"):
        op.create_table(
            "puzzle_results",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("puzzle_date", sa.Date(), nullable=False),
            sa.Column("seconds", sa.Integer(), nullable=False),
            sa.Column("points_override", sa.Integer(), nullable=True),
            sa.Column("note", sa.String(), nullable=True),
            sa.Column("source", sa.String(), nullable=True),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id", name="puzzle_results_pkey"),
            sa.ForeignKeyConstraint(
                ["player_id"], ["player.id"], name="puzzle_results_player_id_fkey"
            ),
            sa.UniqueConstraint(
                "player_id", "puzzle_date", name="uix_result_player_date"
            ),
        )

    for table, index, columns, unique in (
        ("player", "ix_player_name", ["name"], False),
        ("player", "ix_player_handle", ["handle"], True),
        ("player", "ix_player_nyt_username", ["nyt_username"], True),
        ("puzzle_results", "ix_puzzle_results_player_id", ["player_id"], False),
        ("puzzle_results", "ix_puzzle_results_puzzle_date", ["puzzle_date"], False),
    ):
        if not _has_index(table, index):
            op.create_index(index, table, columns, unique=unique)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("puzzle_results")
    op.drop_table("player")
