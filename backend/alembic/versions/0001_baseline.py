"""Baseline schema (users, students).

Revision ID: 0001_baseline
Revises: 
Create Date: 2026-03-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enum used by users.role. Create it if it doesn't exist.
    # Postgres doesn't support `CREATE TYPE ... IF NOT EXISTS` for enums, so use a DO block.
    op.execute(
        """
        DO $$
        BEGIN
          CREATE TYPE user_role AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    user_role = postgresql.ENUM(
        "STUDENT",
        "TEACHER",
        "ADMIN",
        name="user_role",
        create_type=False,
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("clerk_user_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        # NOTE: Present in the current DB from earlier iterations. The app no longer uses it,
        # but keeping it in the baseline avoids breaking existing environments.
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("first_name", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("role", user_role, nullable=False, server_default="STUDENT"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("public_metadata", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("clerk_user_id", name="uq_users_clerk_user_id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_clerk_user_id", "users", ["clerk_user_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "students",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_number", sa.String(), nullable=True),
        sa.Column("program", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_students_user_id"),
        sa.UniqueConstraint("student_number", name="uq_students_student_number"),
    )
    op.create_index("ix_students_id", "students", ["id"])


def downgrade() -> None:
    op.drop_index("ix_students_id", table_name="students")
    op.drop_table("students")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_clerk_user_id", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")

    op.execute("drop type if exists user_role")
