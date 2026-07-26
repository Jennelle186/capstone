"""add pending status to submission_status enum

Revision ID: 20260613_add_pending_status
Revises: 20260612_submission_documents
Create Date: 2026-06-13
"""

from __future__ import annotations

from alembic import op


revision = "20260613_add_pending_status"
down_revision = "20260612_submission_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'pending' to the submission_status enum if it does not already exist.
    # PostgreSQL does not support IF NOT EXISTS for ALTER TYPE ... ADD VALUE,
    # so we guard against duplicate_object errors in a DO block.
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TYPE submission_status ADD VALUE 'pending';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    # PostgreSQL requires the new enum value to be committed before it can be
    # used as a default. Force a commit here, then set the default in a new
    # transaction. Alembic runs each migration in a transaction by default.
    op.execute("COMMIT")

    # Update the default status for new document_submissions rows from 'uploaded'
    # to 'pending' so the presigned-upload flow starts in the correct state.
    op.execute(
        """
        ALTER TABLE document_submissions
        ALTER COLUMN status SET DEFAULT 'pending';
        """
    )


def downgrade() -> None:
    # Revert the column default to 'uploaded'.
    op.execute(
        """
        ALTER TABLE document_submissions
        ALTER COLUMN status SET DEFAULT 'uploaded';
        """
    )

    # PostgreSQL does not provide a built-in way to remove individual enum values
    # without recreating the type. Reverting the enum value is skipped here to
    # avoid dropping a type that may already be referenced by live rows.
