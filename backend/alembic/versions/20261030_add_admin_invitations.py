"""add admin invitations table

Revision ID: 1f2e3d4c5b6a
Revises: d0e1f2a3b4c5
Create Date: 2026-10-30

Idempotent for ``AUTO_CREATE_TABLES`` dev databases: uses ``CREATE TABLE IF NOT
EXISTS`` and reuses the existing ``adviser_invitation_status`` enum type.
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "1f2e3d4c5b6a"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure the shared enum type exists (normally created by the adviser-
    # invitations migration, but guarded here for AUTO_CREATE_TABLES DBs).
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE adviser_invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_invitations (
            id UUID PRIMARY KEY,
            clerk_invitation_id VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            first_name VARCHAR(255),
            middle_name VARCHAR(255),
            last_name VARCHAR(255),
            invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            status adviser_invitation_status NOT NULL DEFAULT 'pending',
            expires_at TIMESTAMPTZ,
            accepted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_invitations_clerk_invitation_id "
        "ON admin_invitations (clerk_invitation_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_invitations_id ON admin_invitations (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_invitations_email ON admin_invitations (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_invitations_status ON admin_invitations (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_invitations")
