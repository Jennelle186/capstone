"""fix document_types JSONB values that were not migrated by the previous migration

Revision ID: 20260620_fix_class_enum_jsonb
Revises: 20260620_update_class_enum
Create Date: 2026-06-20
"""

from __future__ import annotations

from alembic import op


revision = "20260620_fix_class_enum_jsonb"
down_revision = "20260620_update_class_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE document_types
        SET applicable_classifications = 
            REPLACE(
                REPLACE(applicable_classifications::text, '"regular"', '"freshman"'),
                '"shiftee"', '"shifter"'
            )::jsonb
        WHERE applicable_classifications::text LIKE '%"regular"%'
           OR applicable_classifications::text LIKE '%"shiftee"%'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE document_types
        SET applicable_classifications = 
            REPLACE(
                REPLACE(applicable_classifications::text, '"freshman"', '"regular"'),
                '"shifter"', '"shiftee"'
            )::jsonb
        WHERE applicable_classifications::text LIKE '%"freshman"%'
           OR applicable_classifications::text LIKE '%"shifter"%'
        """
    )
