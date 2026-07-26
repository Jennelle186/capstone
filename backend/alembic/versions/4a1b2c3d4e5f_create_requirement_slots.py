"""create requirement_slots and requirement_slot_items tables

Revision ID: 4a1b2c3d4e5f
Revises: 38304ce6f51f
Create Date: 2026-07-14

This migration creates the slot-based requirement model that replaces the flat
``school_year_requirements`` table.  A "slot" is a named logical requirement
(e.g. "Proof of Financial Status") that can accept one or more document types.
The ``requirement_slot_items`` bridge maps document types to slots and carries
per-item schema assignments for extraction.

The legacy ``school_year_requirements`` table is **not** dropped here — it
stays in place for the dual-read / dual-write transition period.
"""

from __future__ import annotations

import uuid
from datetime import timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "4a1b2c3d4e5f"
down_revision = "38304ce6f51f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "requirement_slots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
        ),
        sa.Column(
            "school_year_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("school_years.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "slot_type",
            sa.String(20),
            nullable=False,
            comment="'solo' for single-document requirements, 'group' for alternative-document requirements",
        ),
        sa.Column(
            "group_name",
            sa.String(120),
            nullable=True,
            comment="Human-readable label shown to students (e.g. 'Proof of Financial Status')",
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "min_required",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "snapshot_fields_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Point-in-time snapshot of the assigned schema's fields_json for analytics stability",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "school_year_id",
            "display_order",
            name="uq_requirement_slots_school_year_display_order",
        ),
    )
    op.create_index(
        op.f("ix_requirement_slots_id"),
        "requirement_slots",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_requirement_slots_school_year_id"),
        "requirement_slots",
        ["school_year_id"],
        unique=False,
    )

    op.create_table(
        "requirement_slot_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            default=uuid.uuid4,
        ),
        sa.Column(
            "requirement_slot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("requirement_slots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "extraction_schema_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("extraction_schemas.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "requirement_slot_id",
            "document_type_id",
            name="uq_slot_items_slot_document_type",
        ),
    )
    op.create_index(
        op.f("ix_requirement_slot_items_id"),
        "requirement_slot_items",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_requirement_slot_items_requirement_slot_id"),
        "requirement_slot_items",
        ["requirement_slot_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_requirement_slot_items_document_type_id"),
        "requirement_slot_items",
        ["document_type_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_requirement_slot_items_extraction_schema_id"),
        "requirement_slot_items",
        ["extraction_schema_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_requirement_slot_items_extraction_schema_id"),
        table_name="requirement_slot_items",
    )
    op.drop_index(
        op.f("ix_requirement_slot_items_document_type_id"),
        table_name="requirement_slot_items",
    )
    op.drop_index(
        op.f("ix_requirement_slot_items_requirement_slot_id"),
        table_name="requirement_slot_items",
    )
    op.drop_index(
        op.f("ix_requirement_slot_items_id"),
        table_name="requirement_slot_items",
    )
    op.drop_table("requirement_slot_items")

    op.drop_index(
        op.f("ix_requirement_slots_school_year_id"),
        table_name="requirement_slots",
    )
    op.drop_index(
        op.f("ix_requirement_slots_id"),
        table_name="requirement_slots",
    )
    op.drop_table("requirement_slots")
