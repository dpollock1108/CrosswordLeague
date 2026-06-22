"""make puzzle.puzzle_date nullable (repository model)

Revision ID: a1b2c3d4e5f6
Revises: 9e4f1a2c7d33
Create Date: 2026-06-08 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9e4f1a2c7d33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('puzzle', schema=None) as batch_op:
        batch_op.alter_column('puzzle_date', existing_type=sa.Date(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('puzzle', schema=None) as batch_op:
        batch_op.alter_column('puzzle_date', existing_type=sa.Date(), nullable=False)
