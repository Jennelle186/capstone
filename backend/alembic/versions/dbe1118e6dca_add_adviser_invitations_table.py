"""add adviser invitations table

Revision ID: dbe1118e6dca
Revises: 9a6d6d6b8f44
Create Date: 2026-04-13 16:12:58.283159
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql




# revision identifiers, used by Alembic.
revision = 'dbe1118e6dca'
down_revision = '9a6d6d6b8f44'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE adviser_invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    op.create_table(
        "adviser_invitations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("clerk_invitation_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("middle_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("department_code", sa.String(length=30), nullable=True),
        sa.Column("school_year_id", sa.UUID(), nullable=True),
        sa.Column("invited_by_user_id", sa.UUID(), nullable=True),
        sa.Column("accepted_user_id", sa.UUID(), nullable=True),
        sa.Column("accepted_adviser_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "accepted",
                "revoked",
                "expired",
                name="adviser_invitation_status",
                create_type=False,
            ),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["accepted_adviser_id"],
            ["advisers.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["accepted_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["school_year_id"],
            ["school_years.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clerk_invitation_id", name="uq_adviser_invitations_clerk_invitation_id"),
    )
    op.create_index(op.f("ix_adviser_invitations_id"), "adviser_invitations", ["id"], unique=False)
    op.create_index(
        op.f("ix_adviser_invitations_clerk_invitation_id"),
        "adviser_invitations",
        ["clerk_invitation_id"],
        unique=True,
    )
    op.create_index(op.f("ix_adviser_invitations_email"), "adviser_invitations", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_adviser_invitations_email"), table_name="adviser_invitations")
    op.drop_index(op.f("ix_adviser_invitations_clerk_invitation_id"), table_name="adviser_invitations")
    op.drop_index(op.f("ix_adviser_invitations_id"), table_name="adviser_invitations")
    op.drop_table("adviser_invitations")
    op.execute("DROP TYPE IF EXISTS adviser_invitation_status")
