"""add league visibility and membership status

Revision ID: 7c2a1b9d4e10
Revises: 6ab7fe596eb1
Create Date: 2026-06-08 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '7c2a1b9d4e10'
down_revision: Union[str, Sequence[str], None] = '6ab7fe596eb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('league', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('visibility', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='private')
        )
        batch_op.create_index(batch_op.f('ix_league_visibility'), ['visibility'], unique=False)

    with op.batch_alter_table('league_membership', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='active')
        )
        batch_op.create_index(batch_op.f('ix_league_membership_status'), ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('league_membership', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_membership_status'))
        batch_op.drop_column('status')

    with op.batch_alter_table('league', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_visibility'))
        batch_op.drop_column('visibility')
