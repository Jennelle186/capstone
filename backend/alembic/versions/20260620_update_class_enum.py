"""update student_classification enum: regular->freshman, shiftee->shifter, add returning/cross_enrollee

Revision ID: 20260620_update_class_enum
Revises: 20260619_program_to_uuid
Create Date: 2026-06-20
"""

from __future__ import annotations

from alembic import op


revision = "20260620_update_class_enum"
down_revision = "20260619_program_to_uuid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create new enum type with all 5 values
    op.execute(
        "CREATE TYPE student_classification_new AS ENUM "
        "('freshman', 'transferee', 'shifter', 'returning', 'cross_enrollee')"
    )

    # 2. Drop old default so ALTER COLUMN TYPE can proceed
    op.execute(
        "ALTER TABLE students ALTER COLUMN classification DROP DEFAULT"
    )

    # 3. ALTER column — map old values to new ones
    op.execute(
        """
        ALTER TABLE students
        ALTER COLUMN classification TYPE student_classification_new
        USING (
            CASE classification::text
                WHEN 'regular'    THEN 'freshman'::student_classification_new
                WHEN 'shiftee'    THEN 'shifter'::student_classification_new
                WHEN 'transferee' THEN 'transferee'::student_classification_new
                ELSE 'freshman'::student_classification_new
            END
        )
        """
    )

    # 4. Update document_types.applicable_classifications JSONB arrays
    # Use text replacement to avoid jsonb_array_elements quoting quirks
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

    # 5. Drop old enum type
    op.execute("DROP TYPE student_classification")

    # 6. Rename new type to original name
    op.execute("ALTER TYPE student_classification_new RENAME TO student_classification")

    # 7. Set new default
    op.execute(
        "ALTER TABLE students ALTER COLUMN classification "
        "SET DEFAULT 'freshman'::student_classification"
    )


def downgrade() -> None:
    # 1. Create old enum type
    op.execute(
        "CREATE TYPE student_classification_old AS ENUM "
        "('regular', 'transferee', 'shiftee')"
    )

    # 2. Drop current default so ALTER COLUMN TYPE can proceed
    op.execute(
        "ALTER TABLE students ALTER COLUMN classification DROP DEFAULT"
    )

    # 3. Reverse column mapping
    op.execute(
        """
        ALTER TABLE students
        ALTER COLUMN classification TYPE student_classification_old
        USING (
            CASE classification::text
                WHEN 'freshman'  THEN 'regular'::student_classification_old
                WHEN 'shifter'   THEN 'shiftee'::student_classification_old
                WHEN 'transferee' THEN 'transferee'::student_classification_old
                ELSE 'regular'::student_classification_old
            END
        )
        """
    )

    # 4. Reverse JSONB update
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

    # 5. Drop current enum type
    op.execute("DROP TYPE student_classification")

    # 6. Rename old type back
    op.execute("ALTER TYPE student_classification_old RENAME TO student_classification")

    # 7. Restore server_default
    op.execute(
        "ALTER TABLE students ALTER COLUMN classification "
        "SET DEFAULT 'regular'::student_classification"
    )
