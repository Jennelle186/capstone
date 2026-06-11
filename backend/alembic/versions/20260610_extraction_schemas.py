"""rename admission_form_schemas to extraction_schemas, add document_type_id

Revision ID: 20260610_extraction_schemas
Revises: 20260610_student_school_year
Create Date: 2026-06-10 22:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260610_extraction_schemas"
down_revision = "20260610_student_school_year"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename the PG enum type
    op.execute("ALTER TYPE admission_form_schema_status RENAME TO extraction_schema_status")

    # 2. Rename the table
    op.execute("ALTER TABLE IF EXISTS admission_form_schemas RENAME TO extraction_schemas")

    # 3. Rename the index on extraction_schemas (formerly admission_form_schemas)
    op.execute("ALTER INDEX IF EXISTS ix_admission_form_schemas_id RENAME TO ix_extraction_schemas_id")
    op.execute("ALTER INDEX IF EXISTS ix_admission_form_schemas_status RENAME TO ix_extraction_schemas_status")

    # 4. Add document_type_id to extraction_schemas (nullable)
    op.execute(
        """
        ALTER TABLE extraction_schemas
        ADD COLUMN IF NOT EXISTS document_type_id UUID
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE extraction_schemas
            ADD CONSTRAINT fk_extraction_schemas_document_type
            FOREIGN KEY (document_type_id)
            REFERENCES document_types(id)
            ON DELETE SET NULL;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_extraction_schemas_document_type_id
        ON extraction_schemas (document_type_id)
        """
    )

    # 5. Rename FK column on school_year_requirements
    op.execute(
        """
        ALTER TABLE school_year_requirements
        RENAME COLUMN admission_form_schema_id TO extraction_schema_id
        """
    )

    # 6. Drop old FK, create new one with new name + target table
    op.execute(
        """
        ALTER TABLE school_year_requirements
        DROP CONSTRAINT IF EXISTS fk_school_year_requirements_admission_form_schema
        """
    )
    op.execute(
        """
        ALTER TABLE school_year_requirements
        ADD CONSTRAINT fk_school_year_requirements_extraction_schema
        FOREIGN KEY (extraction_schema_id)
        REFERENCES extraction_schemas(id)
        ON DELETE SET NULL
        """
    )

    # 7. Rename the index
    op.execute(
        """
        ALTER INDEX IF EXISTS ix_school_year_requirements_admission_form_schema_id
        RENAME TO ix_school_year_requirements_extraction_schema_id
        """
    )


def downgrade() -> None:
    # Reverse step 7
    op.execute(
        """
        ALTER INDEX IF EXISTS ix_school_year_requirements_extraction_schema_id
        RENAME TO ix_school_year_requirements_admission_form_schema_id
        """
    )

    # Reverse step 6 — drop new FK, restore old one
    op.execute(
        """
        ALTER TABLE school_year_requirements
        DROP CONSTRAINT IF EXISTS fk_school_year_requirements_extraction_schema
        """
    )
    op.execute(
        """
        ALTER TABLE school_year_requirements
        ADD CONSTRAINT fk_school_year_requirements_admission_form_schema
        FOREIGN KEY (extraction_schema_id)
        REFERENCES extraction_schemas(id)
        ON DELETE SET NULL
        """
    )

    # Reverse step 5
    op.execute(
        """
        ALTER TABLE school_year_requirements
        RENAME COLUMN extraction_schema_id TO admission_form_schema_id
        """
    )

    # Reverse step 4 — drop document_type_id
    op.execute("DROP INDEX IF EXISTS ix_extraction_schemas_document_type_id")
    op.execute("ALTER TABLE extraction_schemas DROP CONSTRAINT IF EXISTS fk_extraction_schemas_document_type")
    op.execute("ALTER TABLE extraction_schemas DROP COLUMN IF EXISTS document_type_id")

    # Reverse step 3
    op.execute("ALTER INDEX IF EXISTS ix_extraction_schemas_id RENAME TO ix_admission_form_schemas_id")
    op.execute("ALTER INDEX IF EXISTS ix_extraction_schemas_status RENAME TO ix_admission_form_schemas_status")

    # Reverse step 2
    op.execute("ALTER TABLE IF EXISTS extraction_schemas RENAME TO admission_form_schemas")

    # Reverse step 1
    op.execute("ALTER TYPE extraction_schema_status RENAME TO admission_form_schema_status")
