"""Tests for the Phase 4B ``form_submissions`` model definition.

These assert the ORM metadata (table, columns, foreign-key on-delete behavior,
JSONB default, and the partial unique draft index) without touching the
database. The migration itself is applied by Alembic (see
``20261024_add_form_submissions.py``).
"""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import JSONB

from app.models import FormSubmission, FormSubmissionStatus


def _column(name: str):
    return FormSubmission.__table__.columns[name]


def test_table_and_columns() -> None:
    assert FormSubmission.__tablename__ == "form_submissions"
    columns = set(FormSubmission.__table__.columns.keys())
    assert {
        "id",
        "student_id",
        "form_id",
        "document_type_id",
        "school_year_id",
        "values",
        "status",
        "created_at",
        "updated_at",
    } <= columns


def test_status_enum_values() -> None:
    assert [status.value for status in FormSubmissionStatus] == ["draft", "submitted"]


def test_student_id_cascades_and_is_required() -> None:
    column = _column("student_id")
    assert column.nullable is False
    assert next(iter(column.foreign_keys)).ondelete == "CASCADE"


def test_form_id_set_null_and_nullable() -> None:
    column = _column("form_id")
    assert column.nullable is True
    assert next(iter(column.foreign_keys)).ondelete == "SET NULL"


def test_document_type_id_set_null_and_nullable() -> None:
    column = _column("document_type_id")
    assert column.nullable is True
    assert next(iter(column.foreign_keys)).ondelete == "SET NULL"


def test_school_year_id_is_required() -> None:
    assert _column("school_year_id").nullable is False


def test_values_is_jsonb_with_empty_object_default() -> None:
    column = _column("values")
    assert isinstance(column.type, JSONB)
    assert column.nullable is False
    assert column.default is not None
    assert column.server_default is not None


def test_partial_unique_index_for_one_draft() -> None:
    index = next(
        ix for ix in FormSubmission.__table__.indexes if ix.name == "ix_form_submissions_one_draft"
    )
    assert index.unique is True
    assert [column.name for column in index.columns] == ["student_id", "form_id", "school_year_id"]
