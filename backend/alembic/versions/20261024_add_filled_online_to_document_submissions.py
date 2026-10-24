"""mark filled-online document submissions

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-24

Treats online-filled forms (Phase 4B) like uploaded documents: they become
``document_submissions`` rows with ``filled_online = true``, no file, and their
typed values in ``extracted_data``. This makes the existing adviser review,
verify, and "one VERIFIED per student+type" logic apply unchanged.

Changes:
- ``document_submissions.filled_online`` (bool, default false). Filled-online
  rows keep an empty ``file_key`` (no uploaded file) and their typed values in
  ``extracted_data``.
- ``form_submissions.document_submission_id`` links a submitted fill to its
  resulting document submission.

Idempotent for ``AUTO_CREATE_TABLES`` dev databases.
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE document_submissions "
        "ADD COLUMN IF NOT EXISTS filled_online BOOLEAN NOT NULL DEFAULT false"
    )

    op.execute(
        "ALTER TABLE form_submissions "
        "ADD COLUMN IF NOT EXISTS document_submission_id UUID"
    )
    op.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE form_submissions
                ADD CONSTRAINT form_submissions_document_submission_id_fkey
                FOREIGN KEY (document_submission_id)
                REFERENCES document_submissions(id) ON DELETE SET NULL;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_form_submissions_document_submission_id "
        "ON form_submissions (document_submission_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_form_submissions_document_submission_id")
    op.execute(
        "ALTER TABLE form_submissions "
        "DROP CONSTRAINT IF EXISTS form_submissions_document_submission_id_fkey"
    )
    op.execute("ALTER TABLE form_submissions DROP COLUMN IF EXISTS document_submission_id")
    op.execute("ALTER TABLE document_submissions DROP COLUMN IF EXISTS filled_online")
