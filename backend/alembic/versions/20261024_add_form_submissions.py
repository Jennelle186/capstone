"""create form_submissions table

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-10-24

Stores a student's typed-in answers for an online-filled printable form
(Phase 4B). This is distinct from ``document_submissions``: no uploaded file, no
classification/extraction, no adviser verification — the typed values are the
structured data.

The upgrade is idempotent: dev environments with ``AUTO_CREATE_TABLES=true``
create this table (and the enum type) from the ORM models on startup before
Alembic runs, so every statement is guarded with ``IF NOT EXISTS`` / duplicate
type handling.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "c9d0e1f2a3b4"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None

ENUM_NAME = "form_submission_status"
TABLE_NAME = "form_submissions"


def upgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
            CREATE TYPE {ENUM_NAME} AS ENUM ('draft', 'submitted');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )
    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            form_id UUID REFERENCES forms(id) ON DELETE SET NULL,
            document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL,
            school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
            values JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            status {ENUM_NAME} NOT NULL DEFAULT 'draft',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_id ON {TABLE_NAME} (id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_student_id ON {TABLE_NAME} (student_id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_form_id ON {TABLE_NAME} (form_id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_document_type_id ON {TABLE_NAME} (document_type_id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_school_year_id ON {TABLE_NAME} (school_year_id)")
    op.execute(f"CREATE INDEX IF NOT EXISTS ix_{TABLE_NAME}_status ON {TABLE_NAME} (status)")

    # One active draft per (student, form, school year).
    op.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_{TABLE_NAME}_one_draft
        ON {TABLE_NAME} (student_id, form_id, school_year_id)
        WHERE status = 'draft'
        """
    )


def downgrade() -> None:
    op.execute(f"DROP TABLE IF EXISTS {TABLE_NAME} CASCADE")
    op.execute(f"DROP TYPE IF EXISTS {ENUM_NAME}")
