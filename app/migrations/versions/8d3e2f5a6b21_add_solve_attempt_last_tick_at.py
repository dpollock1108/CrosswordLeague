"""add solve_attempt.last_tick_at for active-time accrual

Revision ID: 8d3e2f5a6b21
Revises: 7c2a1b9d4e10
Create Date: 2026-06-08 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8d3e2f5a6b21'
down_revision: Union[str, Sequence[str], None] = '7c2a1b9d4e10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('solve_attempt', schema=None) as batch_op:
        batch_op.add_column(sa.Column('last_tick_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('solve_attempt', schema=None) as batch_op:
        batch_op.drop_column('last_tick_at')
