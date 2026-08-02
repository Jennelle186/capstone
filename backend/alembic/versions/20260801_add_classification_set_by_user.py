"""add classification_set_by_user flag to students

Revision ID: 20260801_class_set_by_user
Revises: 7d4e5f6a7b8c
Create Date: 2026-08-01 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260801_class_set_by_user"
down_revision = "7d4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "students",
        sa.Column(
            "classification_set_by_user",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("students", "classification_set_by_user")
