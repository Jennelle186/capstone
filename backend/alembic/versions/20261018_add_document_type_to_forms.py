"""add document_type_id to forms and relax extraction_schema_id uniqueness

Revision ID: e5f6a7b8c9d0
Revises: a7b8c9d0e1f2
Create Date: 2026-10-18 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "forms",
        sa.Column("document_type_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_forms_document_type_id"), "forms", ["document_type_id"], unique=False
    )
    op.create_foreign_key(
        "forms_document_type_id_fkey",
        "forms",
        "document_types",
        ["document_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    # The unique constraint only exists where cc75de5e3f14 was actually run; the
    # out-of-band-created dev DB never had it. Drop defensively so both
    # environments converge on "no uniqueness".
    op.execute("ALTER TABLE forms DROP CONSTRAINT IF EXISTS uq_forms_extraction_schema_id")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE forms ADD CONSTRAINT uq_forms_extraction_schema_id UNIQUE (extraction_schema_id)"
    )
    op.drop_constraint("forms_document_type_id_fkey", "forms", type_="foreignkey")
    op.drop_index(op.f("ix_forms_document_type_id"), table_name="forms")
    op.drop_column("forms", "document_type_id")
