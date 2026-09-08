"""seed analytics_dimensions from existing extraction schema fields

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-29 09:00:00.000000
"""

from __future__ import annotations

from alembic import op


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Populate the registry from every analytics-enabled field across all
    # extraction schemas. Label precedence: analytics_label -> description ->
    # key. `ON CONFLICT DO NOTHING` makes this idempotent and safe to re-run.
    op.execute(
        """
        INSERT INTO analytics_dimensions
            (id, canonical_key, label, field_type, analytics_group, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            left(lower(COALESCE(NULLIF(f->>'canonical_key', ''), f->>'key')), 100),
            left(COALESCE(
                NULLIF(f->>'analytics_label', ''),
                NULLIF(f->>'description', ''),
                f->>'key'
            ), 150),
            left(COALESCE(f->>'type', 'string'), 50),
            left(NULLIF(f->>'analytics_group', ''), 100),
            true,
            now(),
            now()
        FROM extraction_schemas,
        LATERAL jsonb_array_elements(fields_json) AS f
        WHERE f->>'is_analytics' = 'true'
          AND COALESCE(NULLIF(f->>'canonical_key', ''), f->>'key') IS NOT NULL
        ON CONFLICT (lower(canonical_key)) DO NOTHING
        """
    )


def downgrade() -> None:
    # Seeded rows cannot be distinguished from manually-added rows. Truncate
    # entirely acceptable for a seed migration that has no other writers yet.
    op.execute("DELETE FROM analytics_dimensions")
