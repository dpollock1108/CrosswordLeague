"""add qotd tracks

Adds the `track` column to questions and answers so QOTD can run several
independent daily streams (general, math, ...). Existing rows backfill to
"general" via the server default, preserving current behaviour.

Revision ID: d8f1c6b45a90
Revises: c4d7e9a1b302
Create Date: 2026-08-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'd8f1c6b45a90'
down_revision: Union[str, Sequence[str], None] = 'c4d7e9a1b302'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('trivia_question', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'track',
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=False,
                server_default='general',
            )
        )
        batch_op.create_index(batch_op.f('ix_trivia_question_track'), ['track'], unique=False)

    with op.batch_alter_table('trivia_answer', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'track',
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=False,
                server_default='general',
            )
        )
        batch_op.create_index(batch_op.f('ix_trivia_answer_track'), ['track'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('trivia_answer', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trivia_answer_track'))
        batch_op.drop_column('track')

    with op.batch_alter_table('trivia_question', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trivia_question_track'))
        batch_op.drop_column('track')
