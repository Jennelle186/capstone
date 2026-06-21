"""add notifications table and audit columns to document_submissions

Revision ID: 20260621_add_notifications_and_audit_columns
Revises: 20260620_fix_class_enum_jsonb
Create Date: 2026-06-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "20260621_add_notifications_and_audit_columns"
down_revision = "20260620_fix_class_enum_jsonb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add audit columns to document_submissions
    op.add_column(
        "document_submissions",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "document_submissions",
        sa.Column("flagged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "document_submissions",
        sa.Column(
            "flagged_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "document_submissions",
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "document_submissions",
        sa.Column(
            "verified_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Create notifications table
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, index=True),
        sa.Column(
            "recipient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("reference_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_column("document_submissions", "verified_by")
    op.drop_column("document_submissions", "verified_at")
    op.drop_column("document_submissions", "flagged_by")
    op.drop_column("document_submissions", "flagged_at")
    op.drop_column("document_submissions", "rejection_reason")
