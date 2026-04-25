"""add middle_name to users

Revision ID: 9a6d6d6b8f44
Revises: 59f02132afc1
Create Date: 2026-04-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9a6d6d6b8f44"
down_revision = "59f02132afc1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("middle_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "middle_name")
