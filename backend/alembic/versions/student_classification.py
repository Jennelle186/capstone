"""add student classification and document applicable classifications

Revision ID: student_classification
Revises: 20260425_sy_audit
Create Date: 2026-04-25 14:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "student_classification"
down_revision = "20260425_sy_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add classification column to students table
    op.add_column(
        "students",
        sa.Column(
            "classification",
            sa.String(length=20),
            nullable=True,
            server_default="regular",
        ),
    )

    # Add applicable_classifications column to document_types table
    op.add_column(
        "document_types",
        sa.Column(
            "applicable_classifications",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("document_types", "applicable_classifications")
    op.drop_column("students", "classification")