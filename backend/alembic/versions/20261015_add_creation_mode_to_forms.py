"""add creation_mode to forms

Revision ID: a7b8c9d0e1f2
Revises: cc75de5e3f14
Create Date: 2026-10-15 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "a7b8c9d0e1f2"
down_revision = "cc75de5e3f14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column(
            "creation_mode",
            sa.String(length=32),
            server_default="structured",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("forms", "creation_mode")
