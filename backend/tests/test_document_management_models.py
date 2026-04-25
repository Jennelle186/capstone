from __future__ import annotations

from sqlalchemy import UniqueConstraint

from app.models import DocumentType, SchoolYearRequirement


def test_document_type_has_unique_code_index() -> None:
    indexes = DocumentType.__table__.indexes
    assert any(
        index.unique and {column.name for column in index.columns} == {"code"}
        for index in indexes
    )


def test_document_type_has_status_index() -> None:
    indexes = DocumentType.__table__.indexes
    assert any(
        {column.name for column in index.columns} == {"status"}
        for index in indexes
    )


def test_school_year_requirement_has_unique_pair_constraint() -> None:
    constraints = SchoolYearRequirement.__table__.constraints
    assert any(
        isinstance(constraint, UniqueConstraint)
        and {column.name for column in constraint.columns} == {"school_year_id", "document_type_id"}
        for constraint in constraints
    )


def test_school_year_requirement_fk_to_document_type_is_restrict() -> None:
    foreign_key_constraints = SchoolYearRequirement.__table__.foreign_key_constraints
    doc_type_fk = next(
        constraint
        for constraint in foreign_key_constraints
        if any(element.target_fullname == "document_types.id" for element in constraint.elements)
    )
    assert doc_type_fk.ondelete == "RESTRICT"
