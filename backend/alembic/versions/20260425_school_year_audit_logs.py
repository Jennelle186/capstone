"""add school year audit logs

Revision ID: 20260425_sy_audit
Revises: auto_closure_date
Create Date: 2026-04-25 13:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260425_sy_audit"
down_revision = "auto_closure_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "school_year_audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("school_year_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("actor_clerk_user_id", sa.String(length=255), nullable=True),
        sa.Column("previous_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["school_year_id"], ["school_years.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_school_year_audit_logs_id"), "school_year_audit_logs", ["id"], unique=False)
    op.create_index(
        op.f("ix_school_year_audit_logs_school_year_id"),
        "school_year_audit_logs",
        ["school_year_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_school_year_audit_logs_action"),
        "school_year_audit_logs",
        ["action"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_school_year_audit_logs_action"), table_name="school_year_audit_logs")
    op.drop_index(op.f("ix_school_year_audit_logs_school_year_id"), table_name="school_year_audit_logs")
    op.drop_index(op.f("ix_school_year_audit_logs_id"), table_name="school_year_audit_logs")
    op.drop_table("school_year_audit_logs")
