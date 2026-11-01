"""add indexes to admin_audit_logs for the activity log listing

Revision ID: 2c8f0a1d9e7b
Revises: 1f2e3d4c5b6a
Create Date: 2026-11-01

Adds indexes used by ``GET /api/admin/activity-logs`` (newest-first ordering
and per-admin filtering). No table or column changes.

Idempotent: uses ``CREATE INDEX IF NOT EXISTS`` so AUTO_CREATE_TABLES dev
databases can run it safely.
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "2c8f0a1d9e7b"
down_revision = "1f2e3d4c5b6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_created_at "
        "ON admin_audit_logs (created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_actor_user_id "
        "ON admin_audit_logs (actor_user_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_admin_audit_logs_actor_user_id")
    op.execute("DROP INDEX IF EXISTS ix_admin_audit_logs_created_at")
