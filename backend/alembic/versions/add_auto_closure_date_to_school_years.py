"""add auto_closure_date to school_years

Revision ID: auto_closure_date
Revises: 9f3c8a5d1b2e
Create Date: 2026-04-25 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'auto_closure_date'
down_revision = '9f3c8a5d1b2e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "school_years",
        sa.Column("auto_closure_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("school_years", "auto_closure_date")
