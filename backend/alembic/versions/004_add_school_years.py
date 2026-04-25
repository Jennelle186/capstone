"""Add school_years table

Revision ID: 004_add_school_years
Revises: 003_add_adviser
Create Date: 2026-04-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "004_add_school_years"
down_revision = "003_add_adviser"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          CREATE TYPE school_year_status AS ENUM ('UPCOMING', 'ACTIVE', 'CLOSED');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    school_year_status = postgresql.ENUM(
        "UPCOMING",
        "ACTIVE",
        "CLOSED",
        name="school_year_status",
        create_type=False,
    )

    op.create_table(
        "school_years",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            school_year_status,
            nullable=False,
            server_default=sa.text("'UPCOMING'::school_year_status"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("start_date <= end_date", name="ck_school_years_date_range"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_school_years_name"),
    )
    op.create_index("ix_school_years_id", "school_years", ["id"])
    op.create_index("ix_school_years_name", "school_years", ["name"])
    op.create_index(
        "ux_school_years_one_active",
        "school_years",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    op.drop_index("ux_school_years_one_active", table_name="school_years")
    op.drop_index("ix_school_years_name", table_name="school_years")
    op.drop_index("ix_school_years_id", table_name="school_years")
    op.drop_table("school_years")
    op.execute("drop type if exists school_year_status")
