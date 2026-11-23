"""Add sample file columns to extraction_schemas.

Keeps the blank sample form that an admin uploaded to generate a schema, so the
registry can preview it. Both columns are nullable: schemas created before this
migration have no saved sample.

Idempotent (ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS) because
AUTO_CREATE_TABLES dev databases may already carry the columns.

Revision ID: 20261120_extraction_schema_sample
Revises: 3d9a1b7c5e2f
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261120_extraction_schema_sample"
down_revision = "3d9a1b7c5e2f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE extraction_schemas
            ADD COLUMN IF NOT EXISTS sample_file_key VARCHAR(512) NULL,
            ADD COLUMN IF NOT EXISTS sample_content_type VARCHAR(100) NULL
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE extraction_schemas
            DROP COLUMN IF EXISTS sample_content_type,
            DROP COLUMN IF EXISTS sample_file_key
        """
    )
