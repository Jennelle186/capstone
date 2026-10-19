"""Phase 2D acceptance: the form document save gate.

These tests exercise ``_validate_document`` directly (no DB / no HTTP client)
because that function is the single authoritative gate used by both create and
update. FastAPI turns the resulting ``HTTPException`` into a 422 response.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers.admin.forms import _validate_document
from app.schemas.forms import FormCreate
from app.schemas.form_layout import validate_persistable
from app.services.form_document import ground_field_keys


def _field(key: str, **overrides) -> dict:
    return {
        "type": "field",
        "id": f"b-{key}",
        "field_key": key,
        "label": key.replace("_", " ").title(),
        "ui_component": "text_input",
        "required": False,
        "options": None,
        **overrides,
    }


def _doc(*sections: dict) -> dict:
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": "Admission Form",
        "sections": list(sections),
        "signatureLabel": "Signature over Printed Name",
    }


def _section(section_id: str, blocks: list[dict], **overrides) -> dict:
    return {"id": section_id, "heading": section_id.upper(), "blocks": blocks, "fields": [], **overrides}


# ── Rejections ───────────────────────────────────────────────────────────


def test_unresolved_block_is_rejected() -> None:
    document = _doc(
        _section(
            "s1",
            [
                _field("full_name"),
                {"type": "unresolved_field", "id": "u1", "field_key": "invented_key", "label": "Invented"},
            ],
        )
    )

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422
    assert "unresolved" in str(exc.value.detail).lower()


def test_duplicate_field_key_across_sections_is_rejected() -> None:
    document = _doc(
        _section("s1", [_field("full_name")]),
        _section("s2", [_field("full_name")]),
    )

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422
    assert "duplicate" in str(exc.value.detail).lower()


def test_whitespace_only_field_key_is_rejected() -> None:
    document = _doc(_section("s1", [_field("   ")]))

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422


@pytest.mark.parametrize("column_span", [0, 13])
def test_column_span_out_of_range_is_rejected(column_span: int) -> None:
    document = _doc(_section("s1", [_field("full_name", columnSpan=column_span)]))

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422


@pytest.mark.parametrize("page_size", ["Legal", "a4", ""])
def test_invalid_page_size_is_rejected(page_size: str) -> None:
    document = {**_doc(_section("s1", [_field("full_name")])), "page": {"size": page_size}}

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422


@pytest.mark.parametrize("margin", [-1, 51])
def test_margin_out_of_bounds_is_rejected(margin: float) -> None:
    document = {
        **_doc(_section("s1", [_field("full_name")])),
        "page": {"size": "A4", "margins": {"top": margin, "right": 16, "bottom": 14, "left": 16}},
    }

    with pytest.raises(HTTPException) as exc:
        _validate_document(document)

    assert exc.value.status_code == 422


def test_pdf_overlay_creation_mode_is_rejected_by_create_schema() -> None:
    with pytest.raises(ValidationError):
        FormCreate(
            name="Overlay form",
            creation_mode="pdf_overlay",
            document_json=_doc(_section("s1", [_field("full_name")])),
        )


# ── Accepted shapes ──────────────────────────────────────────────────────


def test_legacy_fields_document_is_accepted_and_preserved() -> None:
    document = _doc(
        {
            "id": "s1",
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
    )

    validated = _validate_document(document)

    assert validated["sections"][0]["fields"][0]["field_key"] == "full_name"
    assert validated["sections"][0]["fields"][0]["required"] is True


def test_blocks_document_round_trips_layout_metadata() -> None:
    document = _doc(
        _section(
            "s1",
            [
                _field("full_name", columnSpan=2, pageBreakBefore=True),
                {"type": "paragraph", "id": "p1", "text": "Read carefully.", "pageBreakBefore": False},
                {
                    "type": "table",
                    "id": "t1",
                    "columns": 2,
                    "rows": [["A", "B"], ["1", "2"]],
                    "columnWidths": ["30%", "70%"],
                    "headerRow": True,
                },
                {"type": "signature", "id": "sig1", "label": "Registrar"},
            ],
        )
    )
    document["page"] = {
        "size": "Letter",
        "orientation": "landscape",
        "margins": {"top": 10, "right": 12, "bottom": 10, "left": 12},
        "fitToPage": True,
    }

    validated = _validate_document(document)

    blocks = validated["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == ["field", "paragraph", "table", "signature"]
    assert blocks[0]["columnSpan"] == 2
    assert blocks[0]["pageBreakBefore"] is True
    assert blocks[2]["headerRow"] is True
    assert blocks[2]["columnWidths"] == ["30%", "70%"]
    assert validated["page"] == {
        "size": "Letter",
        "orientation": "landscape",
        "margins": {"top": 10.0, "right": 12.0, "bottom": 10.0, "left": 12.0},
        "fitToPage": True,
    }


# ── Generated document opens, then resolves ──────────────────────────────


def test_generated_document_opens_and_resolves_to_persistable() -> None:
    """A grounded generation with an invented key is rejected until mapped."""
    document = _doc(
        _section(
            "s1",
            [
                _field("full_name"),
                _field("invented_field", id="b-invented", label="Invented Field"),
            ],
        )
    )

    grounded, warnings = ground_field_keys(document, {"full_name"})

    assert warnings
    with pytest.raises(ValueError):
        validate_persistable(grounded)

    # Simulate the editor's "Keep as field": unresolved → field with a real key.
    resolved = {
        **grounded,
        "sections": [
            {
                **section,
                "blocks": [
                    {
                        "type": "field",
                        "id": block["id"],
                        "field_key": "remarks",
                        "label": block.get("label", "Remarks"),
                        "ui_component": "text_input",
                        "required": False,
                        "options": None,
                        "columnSpan": 1,
                        "pageBreakBefore": False,
                        "style": None,
                    }
                    if block["type"] == "unresolved_field"
                    else block
                    for block in section["blocks"]
                ],
            }
            for section in grounded["sections"]
        ],
    }

    validated = _validate_document(resolved)
    assert [b["type"] for b in validated["sections"][0]["blocks"]] == ["field", "field"]
    assert validated["sections"][0]["blocks"][1]["field_key"] == "remarks"


def test_generated_document_without_invented_keys_is_persistable() -> None:
    document = _doc(_section("s1", [_field("full_name"), _field("lrn")]))

    grounded, warnings = ground_field_keys(document, {"full_name", "lrn"})

    assert warnings == []
    assert _validate_document(grounded)["sections"][0]["blocks"][0]["field_key"] == "full_name"
