"""add partial unique index for verified document submissions

Revision ID: 20260816_verified_unique_index
Revises: 20260801_class_set_by_user
Create Date: 2026-08-16 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260816_verified_unique_index"
down_revision = "20260801_class_set_by_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enforce at most one VERIFIED submission per (student, document type).
    # This is a hard backstop for the application-level guard in
    # initiate_upload; a future code path that bypasses that check will still
    # be rejected by the database.
    op.create_index(
        "ix_document_submissions_verified_unique",
        "document_submissions",
        ["student_id", "document_type_id"],
        unique=True,
        postgresql_where=sa.text("status = 'verified'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_submissions_verified_unique",
        table_name="document_submissions",
    )
