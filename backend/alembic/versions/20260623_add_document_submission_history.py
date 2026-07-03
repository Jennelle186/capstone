"""add document_submission_history table and parent_submission_id

Revision ID: 20260623_add_document_submission_history
Revises: 20260622_add_notification_indexes
Create Date: 2026-06-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import UUID


revision = "20260623_add_document_submission_history"
down_revision = "20260622_add_notification_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    # ── Create document_submission_history table (if not exists) ─────────────
    if not inspector.has_table("document_submission_history"):
        op.create_table(
            "document_submission_history",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, index=True),
            sa.Column(
                "submission_id",
                UUID(as_uuid=True),
                sa.ForeignKey("document_submissions.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "actor_user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("action", sa.String(40), nullable=False, index=True),
            sa.Column("previous_status", sa.String(30), nullable=True),
            sa.Column("new_status", sa.String(30), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column(
                "reference_submission_id",
                UUID(as_uuid=True),
                sa.ForeignKey("document_submissions.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )

    # ── Create index on created_at (may be missing if table created elsewhere)
    existing_history_idxs = {
        idx["name"] for idx in inspector.get_indexes("document_submission_history")
    }
    if "ix_document_submission_history_created_at" not in existing_history_idxs:
        op.create_index(
            "ix_document_submission_history_created_at",
            "document_submission_history",
            ["created_at"],
        )

    # ── Add parent_submission_id column (if not exists) ──────────────────────
    ds_columns = {c["name"] for c in inspector.get_columns("document_submissions")}
    if "parent_submission_id" not in ds_columns:
        op.add_column(
            "document_submissions",
            sa.Column(
                "parent_submission_id",
                UUID(as_uuid=True),
                sa.ForeignKey("document_submissions.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # ── Create index on parent_submission_id (if not exists) ─────────────────
    ds_indexes = {idx["name"] for idx in inspector.get_indexes("document_submissions")}
    if "ix_document_submissions_parent" not in ds_indexes:
        op.create_index(
            "ix_document_submissions_parent",
            "document_submissions",
            ["parent_submission_id"],
        )


def downgrade() -> None:
    op.drop_index("ix_document_submissions_parent", table_name="document_submissions", if_exists=True)
    op.drop_column("document_submissions", "parent_submission_id")
    op.drop_index("ix_document_submission_history_created_at", table_name="document_submission_history", if_exists=True)
    op.drop_table("document_submission_history")
