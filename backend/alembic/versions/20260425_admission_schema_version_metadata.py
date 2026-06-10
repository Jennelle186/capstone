"""add admission schema version metadata

Revision ID: 20260425_adm_schema_meta
Revises: 20260425_req_adm_schema
Create Date: 2026-04-25 21:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260425_adm_schema_meta"
down_revision = "20260425_req_adm_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE admission_form_schemas
        ADD COLUMN IF NOT EXISTS version_label VARCHAR(80)
        """
    )
    op.execute(
        """
        ALTER TABLE admission_form_schemas
        ADD COLUMN IF NOT EXISTS effective_date DATE
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE admission_form_schemas
        DROP COLUMN IF EXISTS effective_date
        """
    )
    op.execute(
        """
        ALTER TABLE admission_form_schemas
        DROP COLUMN IF EXISTS version_label
        """
    )
