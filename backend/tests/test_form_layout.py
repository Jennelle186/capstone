from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.form_layout import (
    StructuredFormDocument,
    create_empty_document,
    has_unresolved_blocks,
    parse_structured_document,
    validate_persistable,
)
from app.services.form_document import document_to_fields, normalize_to_blocks


def _legacy_doc() -> dict:
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": "Admission Form",
        "sections": [
            {
                "id": "sec-1",
                "heading": "PERSONAL",
                "fields": [
                    {
                        "id": "f1",
                        "field_key": "full_name",
                        "label": "Full Name",
                        "ui_component": "text_input",
                        "required": True,
                        "options": None,
                    }
                ],
            }
        ],
        "signatureLabel": "Signature over Printed Name",
    }


def test_create_empty_document_parses():
    doc = validate_persistable(create_empty_document())
    assert doc.version == 1
    assert doc.creation_mode == "structured"
    assert doc.sections == []


def test_legacy_fields_document_parses():
    """Parity: a saved v1 doc with only `fields[]` (no `blocks[]`) still parses."""
    doc = parse_structured_document(_legacy_doc())
    assert doc is not None
    assert doc.sections[0].fields[0].field_key == "full_name"


def test_legacy_fields_document_is_persistable():
    doc = validate_persistable(_legacy_doc())
    assert doc.sections[0].fields[0].required is True


def test_blocks_document_parses():
    doc = parse_structured_document(
        {
            "version": 1,
            "creation_mode": "structured",
            "title": "Admission Form",
            "letterhead": {"institutionName": "College of Computer Studies", "formNumber": "ADS-01"},
            "page": {"size": "A4", "orientation": "portrait", "margins": {"top": 14, "right": 16, "bottom": 14, "left": 16}},
            "sections": [
                {
                    "id": "s1",
                    "heading": "Personal",
                    "blocks": [
                        {"type": "field", "id": "b1", "field_key": "full_name", "label": "Full Name", "ui_component": "text_input", "required": True, "columnSpan": 1},
                        {"type": "paragraph", "id": "b2", "text": "Instructions go here.", "style": {"bold": True, "align": "center"}},
                        {"type": "table", "id": "b3", "columns": 2, "rows": [["a", "b"], ["c", "d"]], "columnWidths": ["50%", "50%"]},
                        {"type": "signature", "id": "b4", "label": "Signature"},
                    ],
                    "fields": [],
                }
            ],
            "signatureLabel": "Signature over Printed Name",
        }
    )
    assert doc is not None
    assert doc.letterhead.institutionName == "College of Computer Studies"
    assert doc.page.size == "A4"
    blocks = doc.sections[0].blocks
    assert [b.type for b in blocks] == ["field", "paragraph", "table", "signature"]


def test_unresolved_blocks_detected():
    doc = StructuredFormDocument.model_validate(
        {
            "version": 1,
            "creation_mode": "structured",
            "title": "X",
            "sections": [
                {
                    "id": "s1",
                    "heading": "S",
                    "blocks": [{"type": "unresolved_field", "id": "u1", "field_key": "invented", "label": "Invented"}],
                }
            ],
            "signatureLabel": "Sig",
        }
    )
    assert has_unresolved_blocks(doc) is True


def test_validate_persistable_rejects_unresolved():
    with pytest.raises(ValueError):
        validate_persistable(
            {
                "version": 1,
                "creation_mode": "structured",
                "title": "X",
                "sections": [
                    {
                        "id": "s1",
                        "heading": "S",
                        "blocks": [{"type": "unresolved_field", "id": "u1", "field_key": "invented", "label": "Invented"}],
                    }
                ],
                "signatureLabel": "Sig",
            }
        )


def test_duplicate_field_key_rejected():
    with pytest.raises(ValidationError):
        StructuredFormDocument.model_validate(
            {
                "version": 1,
                "creation_mode": "structured",
                "title": "X",
                "sections": [
                    {
                        "id": "s1",
                        "heading": "S",
                        "blocks": [
                            {"type": "field", "id": "b1", "field_key": "full_name", "label": "A"},
                            {"type": "field", "id": "b2", "field_key": "full_name", "label": "B"},
                        ],
                    }
                ],
                "signatureLabel": "Sig",
            }
        )


def test_whitespace_field_key_rejected():
    with pytest.raises(ValidationError):
        StructuredFormDocument.model_validate(
            {
                "version": 1,
                "creation_mode": "structured",
                "title": "X",
                "sections": [
                    {
                        "id": "s1",
                        "heading": "S",
                        "blocks": [{"type": "field", "id": "b1", "field_key": "   ", "label": "A"}],
                    }
                ],
                "signatureLabel": "Sig",
            }
        )


def test_column_span_out_of_range_rejected():
    with pytest.raises(ValidationError):
        StructuredFormDocument.model_validate(
            {
                "version": 1,
                "creation_mode": "structured",
                "title": "X",
                "sections": [
                    {
                        "id": "s1",
                        "heading": "S",
                        "blocks": [{"type": "field", "id": "b1", "field_key": "k", "label": "A", "columnSpan": 99}],
                    }
                ],
                "signatureLabel": "Sig",
            }
        )


def test_invalid_page_size_rejected():
    with pytest.raises(ValidationError):
        StructuredFormDocument.model_validate(
            {
                "version": 1,
                "creation_mode": "structured",
                "title": "X",
                "page": {"size": "Legal", "orientation": "portrait"},
                "sections": [],
                "signatureLabel": "Sig",
            }
        )


def test_normalize_to_blocks_converts_fields():
    doc = _legacy_doc()
    normalized = normalize_to_blocks(doc)
    section = normalized["sections"][0]
    assert section["fields"] == []
    assert section["blocks"][0]["type"] == "field"
    assert section["blocks"][0]["field_key"] == "full_name"
    assert section["blocks"][0]["required"] is True


def test_normalize_to_blocks_blocks_win():
    doc = {
        "version": 1,
        "creation_mode": "structured",
        "title": "X",
        "sections": [
            {
                "id": "s1",
                "heading": "S",
                "blocks": [{"type": "paragraph", "id": "p1", "text": "keep me"}],
                "fields": [{"id": "f1", "field_key": "stale", "label": "drop me"}],
            }
        ],
        "signatureLabel": "Sig",
    }
    normalized = normalize_to_blocks(doc)
    section = normalized["sections"][0]
    assert section["fields"] == []
    assert [b["type"] for b in section["blocks"]] == ["paragraph"]


def test_document_to_fields_reads_blocks():
    doc = {
        "version": 1,
        "creation_mode": "structured",
        "title": "X",
        "sections": [
            {
                "id": "s1",
                "heading": "PERSONAL",
                "blocks": [
                    {"type": "field", "id": "b1", "field_key": "gender", "label": "Sex", "ui_component": "radio_group", "required": False, "options": None}
                ],
                "fields": [],
            }
        ],
        "signatureLabel": "Sig",
    }
    fields = document_to_fields(doc)
    assert [f["key"] for f in fields] == ["gender"]
    assert fields[0]["type"] == "select"
