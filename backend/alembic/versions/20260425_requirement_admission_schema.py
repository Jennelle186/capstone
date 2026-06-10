"""link admission form schemas to school year requirements

Revision ID: 20260425_req_adm_schema
Revises: 20260425_admission_schema
Create Date: 2026-04-25 20:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260425_req_adm_schema"
down_revision = "20260425_admission_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE school_year_requirements
        ADD COLUMN IF NOT EXISTS admission_form_schema_id UUID
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE school_year_requirements
            ADD CONSTRAINT fk_school_year_requirements_admission_form_schema
            FOREIGN KEY (admission_form_schema_id)
            REFERENCES admission_form_schemas(id)
            ON DELETE SET NULL;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_school_year_requirements_admission_form_schema_id
        ON school_year_requirements (admission_form_schema_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_school_year_requirements_admission_form_schema_id")
    op.execute(
        """
        ALTER TABLE school_year_requirements
        DROP CONSTRAINT IF EXISTS fk_school_year_requirements_admission_form_schema
        """
    )
    op.execute(
        """
        ALTER TABLE school_year_requirements
        DROP COLUMN IF EXISTS admission_form_schema_id
        """
    )
