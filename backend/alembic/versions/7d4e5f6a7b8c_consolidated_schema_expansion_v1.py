"""consolidated_schema_expansion_v1

Revision ID: 7d4e5f6a7b8c
Revises: 6c3d4e5f6a7b
Create Date: 2026-07-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "7d4e5f6a7b8c"
down_revision = "6c3d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add second_courser to StudentClassification enum (safe if already exists)
    try:
        op.execute("ALTER TYPE student_classification ADD VALUE 'second_courser'")
    except Exception:
        pass

    # 2. Add 7 new columns to students
    op.add_column("students", sa.Column("gender", sa.String(20), nullable=True))
    op.add_column("students", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("students", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("students", sa.Column("admission_form_name", postgresql.JSONB(), nullable=True))
    op.add_column("students", sa.Column("program_mismatch_pending", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("students", sa.Column("program_mismatch_extracted", sa.String(30), nullable=True))
    op.add_column("students", sa.Column("accepted_policy_version", sa.String(20), nullable=True))

    # 3. Add 3 new columns to document_submissions
    op.add_column("document_submissions", sa.Column("page_range", sa.String(20), nullable=True))
    op.add_column("document_submissions", sa.Column("segment_index", sa.Integer(), nullable=True))
    op.add_column("document_submissions", sa.Column("is_compiled_parent", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    # 4. Rename school_year_audit_logs → admin_audit_logs (preserves data)
    op.rename_table("school_year_audit_logs", "admin_audit_logs")

    # 5. Add new columns + indexes to admin_audit_logs
    op.add_column("admin_audit_logs", sa.Column("entity_type", sa.String(30), nullable=False))
    op.create_index(op.f("ix_admin_audit_logs_entity_type"), "admin_audit_logs", ["entity_type"])
    op.add_column("admin_audit_logs", sa.Column("entity_id", postgresql.UUID(), nullable=True))
    op.create_index(op.f("ix_admin_audit_logs_entity_id"), "admin_audit_logs", ["entity_id"])
    op.add_column("admin_audit_logs", sa.Column("actor_name", sa.String(200), nullable=True))
    op.add_column("admin_audit_logs", sa.Column("actor_email", sa.String(255), nullable=True))
    op.add_column("admin_audit_logs", sa.Column("actor_role", sa.String(50), nullable=True))
    op.add_column("admin_audit_logs", sa.Column("audit_metadata", postgresql.JSONB(), nullable=True))

    # 6. Alter admin_audit_logs — make school_year_id nullable, widen action
    op.alter_column("admin_audit_logs", "school_year_id", nullable=True)
    op.alter_column("admin_audit_logs", "action", type_=sa.String(50), existing_nullable=False)

    # 7. Create privacy_policies table
    op.create_table(
        "privacy_policies",
        sa.Column("id", postgresql.UUID(), primary_key=True),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("created_by", postgresql.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 8. Create consent_logs table with index on student_id
    op.create_table(
        "consent_logs",
        sa.Column("id", postgresql.UUID(), primary_key=True),
        sa.Column("student_id", postgresql.UUID(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("policy_version", sa.String(20), nullable=False),
        sa.Column("full_name_typed", sa.String(200), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("consented_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_consent_logs_student_id"), "consent_logs", ["student_id"])


def downgrade():
    op.drop_index(op.f("ix_consent_logs_student_id"), table_name="consent_logs")
    op.drop_table("consent_logs")
    op.drop_table("privacy_policies")

    op.alter_column("admin_audit_logs", "action", type_=sa.String(40), existing_nullable=False)
    op.alter_column("admin_audit_logs", "school_year_id", nullable=False)

    op.drop_column("admin_audit_logs", "audit_metadata")
    op.drop_column("admin_audit_logs", "actor_role")
    op.drop_column("admin_audit_logs", "actor_email")
    op.drop_column("admin_audit_logs", "actor_name")
    op.drop_index(op.f("ix_admin_audit_logs_entity_id"), table_name="admin_audit_logs")
    op.drop_column("admin_audit_logs", "entity_id")
    op.drop_index(op.f("ix_admin_audit_logs_entity_type"), table_name="admin_audit_logs")
    op.drop_column("admin_audit_logs", "entity_type")

    op.rename_table("admin_audit_logs", "school_year_audit_logs")

    op.drop_column("document_submissions", "is_compiled_parent")
    op.drop_column("document_submissions", "segment_index")
    op.drop_column("document_submissions", "page_range")

    op.drop_column("students", "accepted_policy_version")
    op.drop_column("students", "program_mismatch_extracted")
    op.drop_column("students", "program_mismatch_pending")
    op.drop_column("students", "admission_form_name")
    op.drop_column("students", "address")
    op.drop_column("students", "birth_date")
    op.drop_column("students", "gender")
