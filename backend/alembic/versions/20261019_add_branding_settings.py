"""add branding_settings singleton table

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-10-19 00:00:00.000000

The upgrade is idempotent: dev environments with ``AUTO_CREATE_TABLES=true``
create this table from the ORM models on backend startup (``Base.metadata.create_all``)
before Alembic runs. In that case the table already exists in the intended shape,
so we only need to record the revision.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op

# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def _branding_table_exists() -> bool:
    if context.is_offline_mode():
        return False
    return sa.inspect(op.get_bind()).has_table("branding_settings")


def upgrade() -> None:
    if _branding_table_exists():
        # Already created by AUTO_CREATE_TABLES (create_all); just stamp.
        return

    op.create_table(
        "branding_settings",
        # Singleton row: the id is always set explicitly to 1, so no sequence is
        # needed. autoincrement=False keeps ORM create_all and Alembic in sync.
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False, autoincrement=False),
        sa.Column("institution_name", sa.String(length=200), nullable=True),
        sa.Column("address_lines", sa.JSON(), nullable=True),
        sa.Column("contact_line", sa.String(length=200), nullable=True),
        sa.Column("logo_file_key", sa.String(length=512), nullable=True),
        sa.Column("logo_content_type", sa.String(length=100), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_branding_settings_singleton"),
    )


def downgrade() -> None:
    if _branding_table_exists():
        op.drop_table("branding_settings")
