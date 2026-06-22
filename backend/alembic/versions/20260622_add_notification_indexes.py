"""add composite indexes to notifications table

Revision ID: 20260622_add_notification_indexes
Revises: 20260621_add_notifications_and_audit_columns
Create Date: 2026-06-22
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260622_add_notification_indexes"
down_revision = "20260621_add_notifications_and_audit_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_notifications_recipient_is_read",
        "notifications",
        ["recipient_id", "is_read"],
    )
    op.create_index(
        "ix_notifications_recipient_created_at",
        "notifications",
        ["recipient_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_recipient_created_at", table_name="notifications")
    op.drop_index("ix_notifications_recipient_is_read", table_name="notifications")
