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
    # but a fresh database build starts with a VARCHAR column (see
    # student_classification.py) and no enum type at all. Older databases
    # instead got the type injected by Base.metadata.create_all, which created
    # it with uppercase labels (REGULAR/TRANSFEREE/SHIFTEE). This migration
    # self-heals all three starting states:
    #   1. no type + varchar column -> create the type, then convert the column
    #   2. type with uppercase labels  -> rename the labels to lowercase
    #   3. type with lowercase labels  -> no-op
    # Every block is guarded so a re-run against an already-migrated database
    # is a safe no-op.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type
                WHERE typname = 'student_classification' AND typtype = 'e'
            ) THEN
                CREATE TYPE student_classification AS ENUM
                    ('REGULAR', 'TRANSFEREE', 'SHIFTEE');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_type
                WHERE typname = 'student_classification' AND typtype = 'e'
            ) AND NOT EXISTS (
                SELECT 1
                FROM pg_attribute a
                JOIN pg_type t ON t.oid = a.atttypid
                WHERE a.attrelid = 'students'::regclass
                  AND a.attname = 'classification'
                  AND t.typname = 'student_classification'
            ) THEN
                ALTER TABLE students ALTER COLUMN classification DROP DEFAULT;
                ALTER TABLE students
                ALTER COLUMN classification TYPE student_classification
                USING (
                    CASE upper(classification)
                        WHEN 'REGULAR'    THEN 'REGULAR'::student_classification
                        WHEN 'TRANSFEREE' THEN 'TRANSFEREE'::student_classification
                        WHEN 'SHIFTEE'    THEN 'SHIFTEE'::student_classification
                        ELSE 'REGULAR'::student_classification
                    END
                );
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'REGULAR'
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
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'TRANSFEREE'
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
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'SHIFTEE'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'SHIFTEE' TO 'shiftee';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # Reverse the upgrade: rename the lowercase labels back to uppercase,
    # restore the VARCHAR column, then drop the type. Each step is guarded so
    # a database that never held an uppercase enum (e.g. one built entirely by
    # the migration chain) unwinds cleanly back to the pre-position-20 state.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'regular'
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
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'transferee'
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
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'student_classification'
                  AND e.enumlabel = 'shiftee'
            ) THEN
                ALTER TYPE student_classification RENAME VALUE 'shiftee' TO 'SHIFTEE';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_attribute a
                JOIN pg_type t ON t.oid = a.atttypid
                WHERE a.attrelid = 'students'::regclass
                  AND a.attname = 'classification'
                  AND t.typname = 'student_classification'
            ) THEN
                ALTER TABLE students ALTER COLUMN classification DROP DEFAULT;
                ALTER TABLE students
                ALTER COLUMN classification TYPE VARCHAR(20)
                USING lower(classification::text);
                ALTER TABLE students ALTER COLUMN classification
                SET DEFAULT 'regular';
            END IF;
        END $$;
        """
    )
    op.execute("DROP TYPE IF EXISTS student_classification")
