"""add league and league_membership tables

Revision ID: 6ab7fe596eb1
Revises: e49197c143cc
Create Date: 2026-06-08 17:28:11.298421

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '6ab7fe596eb1'
down_revision: Union[str, Sequence[str], None] = 'e49197c143cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'league',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('invite_code', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('creator_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['creator_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invite_code'),
    )
    with op.batch_alter_table('league', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_name'), ['name'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_invite_code'), ['invite_code'], unique=False)

    op.create_table(
        'league_membership',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('league_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['league_id'], ['league.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('league_id', 'user_id', name='uix_league_user'),
    )
    with op.batch_alter_table('league_membership', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_membership_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_membership_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('league_membership', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_membership_user_id'))
        batch_op.drop_index(batch_op.f('ix_league_membership_league_id'))
    op.drop_table('league_membership')

    with op.batch_alter_table('league', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_invite_code'))
        batch_op.drop_index(batch_op.f('ix_league_name'))
    op.drop_table('league')
