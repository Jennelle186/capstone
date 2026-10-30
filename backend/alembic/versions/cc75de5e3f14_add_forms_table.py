"""add forms table

Revision ID: cc75de5e3f14
Revises: d5e6f7a8b9c0
Create Date: 2026-10-13 20:56:21.427420
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'cc75de5e3f14'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'forms',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column(
            'document_json',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column('pdf_file_key', sa.String(length=512), nullable=True),
        sa.Column('extraction_schema_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['extraction_schema_id'], ['extraction_schemas.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('extraction_schema_id', name='uq_forms_extraction_schema_id'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_forms_id'), 'forms', ['id'], unique=False)
    op.create_index(op.f('ix_forms_extraction_schema_id'), 'forms', ['extraction_schema_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_forms_extraction_schema_id'), table_name='forms')
    op.drop_index(op.f('ix_forms_id'), table_name='forms')
    op.drop_table('forms')
