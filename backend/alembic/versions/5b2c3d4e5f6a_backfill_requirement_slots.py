"""backfill requirement_slots from legacy school_year_requirements

Revision ID: 5b2c3d4e5f6a
Revises: 4a1b2c3d4e5f
Create Date: 2026-07-14

Converts every existing ``school_year_requirements`` row into a solo
``RequirementSlot`` with a single ``RequirementSlotItem``.  ``display_order``
is generated sequentially per school year using ``ROW_NUMBER()`` so the
unique constraint ``(school_year_id, display_order)`` is satisfied.

The two INSERT statements are **separate** ``op.execute()`` calls because
asyncpg does not support multiple commands in a single prepared statement.

The second step uses a CTE to pair legacy rows to newly created slots via
matching ``ROW_NUMBER()`` ordinals, which is deterministic and avoids the
timestamp-collision bug present in an earlier version of this migration.
"""

from __future__ import annotations

from alembic import op


revision = "5b2c3d4e5f6a"
down_revision = "4a1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO requirement_slots
            (id, school_year_id, slot_type, group_name, min_required,
             display_order, snapshot_fields_json, created_at, updated_at)
        SELECT
            gen_random_uuid()               AS id,
            legacy.school_year_id,
            'solo'                          AS slot_type,
            NULL                            AS group_name,
            1                               AS min_required,
            ROW_NUMBER() OVER (
                PARTITION BY legacy.school_year_id
                ORDER BY legacy.created_at, legacy.id
            ) - 1                           AS display_order,
            legacy.snapshot_fields_json,
            legacy.created_at,
            legacy.updated_at
        FROM school_year_requirements AS legacy;
        """
    )

    op.execute(
        """
        WITH legacy_rows AS (
            SELECT
                id AS legacy_id,
                school_year_id,
                document_type_id,
                extraction_schema_id,
                created_at,
                updated_at,
                ROW_NUMBER() OVER (
                    PARTITION BY school_year_id
                    ORDER BY created_at, id
                ) AS row_num
            FROM school_year_requirements
        ),
        new_slots AS (
            SELECT
                id AS slot_id,
                school_year_id,
                ROW_NUMBER() OVER (
                    PARTITION BY school_year_id
                    ORDER BY created_at, id
                ) AS row_num
            FROM requirement_slots
        )
        INSERT INTO requirement_slot_items
            (id, requirement_slot_id, document_type_id, extraction_schema_id,
             is_primary, display_order, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            new_slots.slot_id,
            legacy_rows.document_type_id,
            legacy_rows.extraction_schema_id,
            TRUE,
            0,
            legacy_rows.created_at,
            legacy_rows.updated_at
        FROM legacy_rows
        JOIN new_slots
            ON  legacy_rows.school_year_id = new_slots.school_year_id
            AND legacy_rows.row_num         = new_slots.row_num;
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM requirement_slot_items;")
    op.execute("DELETE FROM requirement_slots;")
