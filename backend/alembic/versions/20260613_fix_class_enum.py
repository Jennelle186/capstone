"""fix student_classification enum values to match model

Revision ID: 20260613_fix_class_enum
Revises: 20260613_add_pending_status
Create Date: 2026-06-13
"""

from __future__ import annotations

from alembic import op


revision = "20260613_fix_class_enum"
down_revision = "20260613_add_pending_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The ORM model uses lowercase enum values (regular/transferee/shiftee),
    # but the database enum was created with uppercase labels. Rename the
    # values so the two match. The DO blocks make this idempotent: if the
    # old uppercase label is already gone, the statement is skipped.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'REGULAR'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'REGULAR' TO 'regular';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'TRANSFEREE'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'TRANSFEREE' TO 'transferee';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'SHIFTEE'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'SHIFTEE' TO 'shiftee';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'regular'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'regular' TO 'REGULAR';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'transferee'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'transferee' TO 'TRANSFEREE';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumtypid = 'student_classification'::regtype
                  AND enumlabel = 'shiftee'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'shiftee' TO 'SHIFTEE';
            END IF;
        END $$;
        """
    )
