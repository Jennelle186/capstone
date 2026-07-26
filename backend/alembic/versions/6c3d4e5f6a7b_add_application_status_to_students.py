"""add application_status to students

Revision ID: 6c3d4e5f6a7b
Revises: 5b2c3d4e5f6a
Create Date: 2026-07-14

"""
from alembic import op
import sqlalchemy as sa

revision = "6c3d4e5f6a7b"
down_revision = "5b2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("students", sa.Column("application_status", sa.String(30), nullable=True))
    op.create_index("idx_students_app_status", "students", ["application_status"])


def downgrade():
    op.drop_index("idx_students_app_status", table_name="students")
    op.drop_column("students", "application_status")
