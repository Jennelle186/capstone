"""add image_url column to users table

Revision ID: 20260703_add_user_image_url
Revises: 20260623_add_document_submission_history
Create Date: 2026-07-03 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260703_add_user_image_url"
down_revision = "20260623_add_document_submission_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("image_url", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "image_url")
