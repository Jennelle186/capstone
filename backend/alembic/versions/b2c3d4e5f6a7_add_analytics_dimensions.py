"""add analytics_dimensions table

Revision ID: b2c3d4e5f6a7
Revises: 20260817_program_adviser_assignment_unique
Create Date: 2026-08-29 08:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "20260817_program_adviser_assignment_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analytics_dimensions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("canonical_key", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=150), nullable=False),
        sa.Column("field_type", sa.String(length=50), nullable=False),
        sa.Column("analytics_group", sa.String(length=100), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_analytics_dimensions_id"),
        "analytics_dimensions",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("uq_analytics_dimensions_canonical_key_lower"),
        "analytics_dimensions",
        [sa.text("lower(canonical_key)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("uq_analytics_dimensions_canonical_key_lower"),
        table_name="analytics_dimensions",
    )
    op.drop_index(
        op.f("ix_analytics_dimensions_id"),
        table_name="analytics_dimensions",
    )
    op.drop_table("analytics_dimensions")
