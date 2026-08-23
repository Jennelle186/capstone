"""add unique constraint on program adviser assignments

Revision ID: 20260817_program_adviser_assignment_unique
Revises: 20260816_verified_unique_index
Create Date: 2026-08-17 08:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260817_program_adviser_assignment_unique"
down_revision = "20260816_verified_unique_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deduplicate any existing rows that violate the new constraint before the
    # unique constraint is added. When duplicates exist, keep the most recently
    # updated row per (adviser_id, program_id, school_year_id) and delete the
    # rest, mirroring the application's "latest assignment wins" ordering.
    op.execute(
        """
        DELETE FROM program_adviser_assignments a
        USING program_adviser_assignments b
        WHERE a.id <> b.id
          AND a.adviser_id = b.adviser_id
          AND a.program_id = b.program_id
          AND a.school_year_id = b.school_year_id
          AND (a.updated_at, a.created_at, a.id) <
              (b.updated_at, b.created_at, b.id)
        """
    )

    op.create_unique_constraint(
        "uq_program_adviser_assignment",
        "program_adviser_assignments",
        ["adviser_id", "program_id", "school_year_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_program_adviser_assignment",
        "program_adviser_assignments",
        type_="unique",
    )
