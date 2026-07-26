"""add submitted status to submission_status enum

Revision ID: 20260619_add_submitted_status
Revises: 20260613_fix_class_enum
Create Date: 2026-06-19
"""

from __future__ import annotations

from alembic import op


revision = "20260619_add_submitted_status"
down_revision = "20260613_fix_class_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'submitted' to the submission_status enum if it does not already exist.
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TYPE submission_status ADD VALUE 'submitted';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )


def downgrade() -> None:
    # PostgreSQL does not provide a built-in way to remove individual enum values
    # without recreating the type. Skipping to avoid dropping a type that may
    # already be referenced by live rows.
    pass
