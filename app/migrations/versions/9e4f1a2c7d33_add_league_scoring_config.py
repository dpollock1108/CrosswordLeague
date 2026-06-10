"""add league_scoring_config table

Revision ID: 9e4f1a2c7d33
Revises: 8d3e2f5a6b21
Create Date: 2026-06-08 19:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '9e4f1a2c7d33'
down_revision: Union[str, Sequence[str], None] = '8d3e2f5a6b21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'league_scoring_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('mini_tiers', sa.Text(), nullable=False),
        sa.Column('mini_bonus', sa.Integer(), nullable=False),
        sa.Column('medium_tiers', sa.Text(), nullable=False),
        sa.Column('medium_bonus', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['league.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('league_id'),
    )
    with op.batch_alter_table('league_scoring_config', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_scoring_config_league_id'), ['league_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('league_scoring_config', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_scoring_config_league_id'))
    op.drop_table('league_scoring_config')
