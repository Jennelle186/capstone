"""create document_submissions table

Revision ID: 20260612_submission_documents
Revises: 20260610_extraction_schemas
Create Date: 2026-06-12
"""

from __future__ import annotations

from alembic import op


revision = "20260612_submission_documents"
down_revision = "20260610_extraction_schemas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
            """
            DO $$
            BEGIN
                CREATE TYPE submission_status AS ENUM ('uploaded', 'processing', 'classified', 'extracting', 'in-review', 'verified', 'flagged');
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END
            $$;
            """
        )
    op.execute("""
        CREATE TABLE IF NOT EXISTS document_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            file_key VARCHAR(512) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            file_size VARCHAR(32),
            mime_type VARCHAR(128),
            is_compiled BOOLEAN NOT NULL DEFAULT FALSE,
            status submission_status NOT NULL DEFAULT 'uploaded',
            classification_result JSONB,
            extracted_data JSONB,
            llama_job_id VARCHAR(255),
            document_type_id UUID REFERENCES document_types(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_document_submissions_id ON document_submissions (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_submissions_student_id ON document_submissions (student_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_submissions_status ON document_submissions (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_submissions CASCADE")
    op.execute("DROP TYPE IF EXISTS submission_status")
