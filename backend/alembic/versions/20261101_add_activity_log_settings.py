"""add activity_log_settings (activity log retention policy)

Revision ID: 3d9a1b7c5e2f
Revises: 2c8f0a1d9e7b
Create Date: 2026-11-01

Single-row table holding the retention period for admin_audit_logs.
No row means the application default applies.

Idempotent: uses ``CREATE TABLE IF NOT EXISTS`` so AUTO_CREATE_TABLES dev
databases can run it safely.
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "3d9a1b7c5e2f"
down_revision = "2c8f0a1d9e7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS activity_log_settings (
            id INTEGER PRIMARY KEY,
            retention_days INTEGER NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS activity_log_settings")
