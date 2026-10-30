"""add form_id to requirement_slot_items

Revision ID: b7c8d9e0f1a2
Revises: f1a2b3c4d5e6
Create Date: 2026-10-22 00:00:00.000000

Binds an optional printable blank form to a requirement slot item. The form's
document type must match the item's document type; that rule is enforced by the
service layer, not by a database constraint.

The upgrade is idempotent: dev environments with ``AUTO_CREATE_TABLES=true``
create this column from the ORM models on backend startup
(``Base.metadata.create_all``) before Alembic runs. In that case the column,
foreign key, and index already exist, so we only record the revision.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b7c8d9e0f1a2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

FK_NAME = "requirement_slot_items_form_id_fkey"
INDEX_NAME = "ix_requirement_slot_items_form_id"


def _inspector():
    if context.is_offline_mode():
        return None
    return sa.inspect(op.get_bind())


def _has_column(inspector) -> bool:
    return any(
        column["name"] == "form_id"
        for column in inspector.get_columns("requirement_slot_items")
    )


def _form_fk_name(inspector) -> str | None:
    for foreign_key in inspector.get_foreign_keys("requirement_slot_items"):
        if (
            foreign_key.get("constrained_columns") == ["form_id"]
            and foreign_key.get("referred_table") == "forms"
        ):
            return foreign_key.get("name")
    return None


def _form_index_name(inspector) -> str | None:
    for index in inspector.get_indexes("requirement_slot_items"):
        if index.get("column_names") == ["form_id"]:
            return index.get("name")
    return None


def upgrade() -> None:
    inspector = _inspector()

    if inspector is None:
        op.add_column(
            "requirement_slot_items",
            sa.Column("form_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            FK_NAME,
            "requirement_slot_items",
            "forms",
            ["form_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(op.f(INDEX_NAME), "requirement_slot_items", ["form_id"], unique=False)
        return

    if not _has_column(inspector):
        op.add_column(
            "requirement_slot_items",
            sa.Column("form_id", postgresql.UUID(as_uuid=True), nullable=True),
        )

    if _form_fk_name(inspector) is None:
        op.create_foreign_key(
            FK_NAME,
            "requirement_slot_items",
            "forms",
            ["form_id"],
            ["id"],
            ondelete="SET NULL",
        )

    if _form_index_name(inspector) is None:
        op.create_index(op.f(INDEX_NAME), "requirement_slot_items", ["form_id"], unique=False)


def downgrade() -> None:
    inspector = _inspector()

    if inspector is None:
        op.drop_index(op.f(INDEX_NAME), table_name="requirement_slot_items")
        op.drop_constraint(FK_NAME, "requirement_slot_items", type_="foreignkey")
        op.drop_column("requirement_slot_items", "form_id")
        return

    index_name = _form_index_name(inspector)
    if index_name:
        op.drop_index(op.f(index_name), table_name="requirement_slot_items")

    fk_name = _form_fk_name(inspector)
    if fk_name:
        op.drop_constraint(fk_name, "requirement_slot_items", type_="foreignkey")

    if _has_column(inspector):
        op.drop_column("requirement_slot_items", "form_id")
