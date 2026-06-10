"""add admission form schemas

Revision ID: 20260425_admission_schema
Revises: student_classification
Create Date: 2026-04-25 19:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260425_admission_schema"
down_revision = "student_classification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE admission_form_schema_status AS ENUM ('draft', 'active', 'archived');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admission_form_schemas (
            id UUID PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            description TEXT,
            schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            status admission_form_schema_status NOT NULL DEFAULT 'draft',
            source_file_name VARCHAR(255),
            generation_prompt TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_admission_form_schemas_id
        ON admission_form_schemas (id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_admission_form_schemas_status
        ON admission_form_schemas (status)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_admission_form_schemas_status")
    op.execute("DROP INDEX IF EXISTS ix_admission_form_schemas_id")
    op.execute("DROP TABLE IF EXISTS admission_form_schemas")
    op.execute("DROP TYPE IF EXISTS admission_form_schema_status")
