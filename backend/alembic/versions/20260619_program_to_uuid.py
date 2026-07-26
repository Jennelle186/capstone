"""migrate student.program string to program_id uuid fk

Revision ID: 20260619_program_to_uuid
Revises: 20260619_add_submitted_status
Create Date: 2026-06-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260619_program_to_uuid"
down_revision = "20260619_add_submitted_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "students",
        sa.Column("program_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.execute(
        """
        UPDATE students s
        SET program_id = d.id
        FROM departments d
        WHERE LOWER(s.program) = LOWER(d.code)
        """
    )

    op.create_foreign_key(
        "fk_students_program_id_departments",
        "students",
        "departments",
        ["program_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_column("students", "program")


def downgrade() -> None:
    op.add_column(
        "students",
        sa.Column("program", sa.String(), nullable=True),
    )

    op.execute(
        """
        UPDATE students s
        SET program = d.code
        FROM departments d
        WHERE s.program_id = d.id
        """
    )

    op.drop_constraint("fk_students_program_id_departments", "students", type_="foreignkey")

    op.drop_column("students", "program_id")
