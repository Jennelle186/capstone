"""add school_year_id to students

Revision ID: 20260610_student_school_year
Revises: 20260425_adm_schema_meta
Create Date: 2026-06-10 20:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260610_student_school_year"
down_revision = "20260425_adm_schema_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE students
        ADD COLUMN IF NOT EXISTS school_year_id UUID
        """
    )
    op.execute(
        """
        ALTER TABLE students
        ADD CONSTRAINT fk_students_school_year
        FOREIGN KEY (school_year_id)
        REFERENCES school_years(id)
        ON DELETE SET NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_students_school_year_id
        ON students(school_year_id)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS ix_students_school_year_id
        """
    )
    op.execute(
        """
        ALTER TABLE students
        DROP CONSTRAINT IF EXISTS fk_students_school_year
        """
    )
    op.execute(
        """
        ALTER TABLE students
        DROP COLUMN IF EXISTS school_year_id
        """
    )
