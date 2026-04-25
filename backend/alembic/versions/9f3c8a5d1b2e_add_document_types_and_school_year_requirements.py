"""add document types and school year requirements

Revision ID: 9f3c8a5d1b2e
Revises: dbe1118e6dca
Create Date: 2026-04-20
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "9f3c8a5d1b2e"
down_revision = "dbe1118e6dca"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE document_type_status AS ENUM ('active', 'archived');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    op.create_table(
        "document_types",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("classifier_description", sa.Text(), nullable=True),
        sa.Column(
            "keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "active",
                "archived",
                name="document_type_status",
                create_type=False,
            ),
            server_default=sa.text("'active'::document_type_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_document_types_id"), "document_types", ["id"], unique=False)
    op.create_index(op.f("ix_document_types_code"), "document_types", ["code"], unique=True)
    op.create_index(op.f("ix_document_types_status"), "document_types", ["status"], unique=False)

    op.create_table(
        "school_year_requirements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("school_year_id", sa.UUID(), nullable=False),
        sa.Column("document_type_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["school_year_id"], ["school_years.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_type_id"], ["document_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "school_year_id",
            "document_type_id",
            name="uq_school_year_requirements_school_year_document_type",
        ),
    )
    op.create_index(
        op.f("ix_school_year_requirements_id"),
        "school_year_requirements",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_school_year_requirements_school_year_id"),
        "school_year_requirements",
        ["school_year_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_school_year_requirements_document_type_id"),
        "school_year_requirements",
        ["document_type_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_school_year_requirements_document_type_id"),
        table_name="school_year_requirements",
    )
    op.drop_index(
        op.f("ix_school_year_requirements_school_year_id"),
        table_name="school_year_requirements",
    )
    op.drop_index(op.f("ix_school_year_requirements_id"), table_name="school_year_requirements")
    op.drop_table("school_year_requirements")

    op.drop_index(op.f("ix_document_types_status"), table_name="document_types")
    op.drop_index(op.f("ix_document_types_code"), table_name="document_types")
    op.drop_index(op.f("ix_document_types_id"), table_name="document_types")
    op.drop_table("document_types")

    op.execute("DROP TYPE IF EXISTS document_type_status")
