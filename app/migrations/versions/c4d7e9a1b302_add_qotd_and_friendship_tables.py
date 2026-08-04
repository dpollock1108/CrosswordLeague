"""add qotd and friendship tables

Revision ID: c4d7e9a1b302
Revises: a1b2c3d4e5f6
Create Date: 2026-08-04 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c4d7e9a1b302'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'friendship',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('requester_id', sa.Integer(), nullable=False),
        sa.Column('addressee_id', sa.Integer(), nullable=False),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['addressee_id'], ['user.id'], ),
        sa.ForeignKeyConstraint(['requester_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('requester_id', 'addressee_id', name='uix_friend_pair'),
    )
    op.create_index(op.f('ix_friendship_addressee_id'), 'friendship', ['addressee_id'], unique=False)
    op.create_index(op.f('ix_friendship_requester_id'), 'friendship', ['requester_id'], unique=False)
    op.create_index(op.f('ix_friendship_status'), 'friendship', ['status'], unique=False)

    op.create_table(
        'trivia_question',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('choices_data', sa.Text(), nullable=False),
        sa.Column('answer_index', sa.Integer(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('difficulty', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('source_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('submitted_by', sa.Integer(), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('question_date', sa.Date(), nullable=True),
        sa.Column('verdict', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('verdict_confidence', sa.Integer(), nullable=True),
        sa.Column('verdict_notes', sa.Text(), nullable=True),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['reviewed_by'], ['user.id'], ),
        sa.ForeignKeyConstraint(['submitted_by'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_trivia_question_category'), 'trivia_question', ['category'], unique=False)
    op.create_index(op.f('ix_trivia_question_question_date'), 'trivia_question', ['question_date'], unique=False)
    op.create_index(op.f('ix_trivia_question_status'), 'trivia_question', ['status'], unique=False)
    op.create_index(op.f('ix_trivia_question_submitted_by'), 'trivia_question', ['submitted_by'], unique=False)

    op.create_table(
        'trivia_answer',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('question_date', sa.Date(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('answered_at', sa.DateTime(), nullable=True),
        sa.Column('seconds', sa.Integer(), nullable=True),
        sa.Column('selected_index', sa.Integer(), nullable=True),
        sa.Column('is_correct', sa.Boolean(), nullable=True),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['question_id'], ['trivia_question.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'question_id', name='uix_answer_user_question'),
    )
    op.create_index(op.f('ix_trivia_answer_question_date'), 'trivia_answer', ['question_date'], unique=False)
    op.create_index(op.f('ix_trivia_answer_question_id'), 'trivia_answer', ['question_id'], unique=False)
    op.create_index(op.f('ix_trivia_answer_user_id'), 'trivia_answer', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_trivia_answer_user_id'), table_name='trivia_answer')
    op.drop_index(op.f('ix_trivia_answer_question_id'), table_name='trivia_answer')
    op.drop_index(op.f('ix_trivia_answer_question_date'), table_name='trivia_answer')
    op.drop_table('trivia_answer')

    op.drop_index(op.f('ix_trivia_question_submitted_by'), table_name='trivia_question')
    op.drop_index(op.f('ix_trivia_question_status'), table_name='trivia_question')
    op.drop_index(op.f('ix_trivia_question_question_date'), table_name='trivia_question')
    op.drop_index(op.f('ix_trivia_question_category'), table_name='trivia_question')
    op.drop_table('trivia_question')

    op.drop_index(op.f('ix_friendship_status'), table_name='friendship')
    op.drop_index(op.f('ix_friendship_requester_id'), table_name='friendship')
    op.drop_index(op.f('ix_friendship_addressee_id'), table_name='friendship')
    op.drop_table('friendship')
