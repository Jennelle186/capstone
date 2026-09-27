"""add page_count and compiled-children grouping index to document_submissions

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-09-10 00:00:00.000000

Feature 3 (Compiled PDF Splitting) Phase 0:
- Add ``page_count`` Integer column (total pages on the parent, segment length
  on each child).
- Add a partial composite index on (is_compiled, parent_submission_id) for the
  grouping queries the split pipeline will issue.
- ``page_range`` stays String(20) ("1-2", "3-5") — no type migration needed.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "d5e6f7a8b9c0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document_submissions",
        sa.Column("page_count", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_document_submissions_compiled_grouping",
        "document_submissions",
        ["is_compiled", "parent_submission_id"],
        unique=False,
        postgresql_where=sa.text(
            "is_compiled = true OR parent_submission_id IS NOT NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_submissions_compiled_grouping",
        table_name="document_submissions",
    )
    op.drop_column("document_submissions", "page_count")
