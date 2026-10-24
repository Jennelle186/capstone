"""Form generation input contract.

Grounded generation may omit the free-text description; description-only
generation still requires it. An explicitly empty field catalog is rejected so
the route cannot silently fall back to inventing fields.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.routers.admin import forms as forms_router
from app.schemas.extraction_schemas import ExtractionSchemaField
from app.schemas.forms import FormGenerateRequest


def _field(key: str = "full_name") -> ExtractionSchemaField:
    return ExtractionSchemaField(
        id=f"f-{key}",
        key=key,
        description=key.replace("_", " ").title(),
        required=True,
        ui_component="text_input",
    )


def test_description_is_optional_when_grounded() -> None:
    payload = FormGenerateRequest(fields=[_field()])

    assert payload.description == ""
    assert payload.fields is not None


def test_description_is_required_without_a_schema() -> None:
    with pytest.raises(ValidationError, match="Describe the form"):
        FormGenerateRequest(description="   ")


def test_whitespace_description_is_stripped_when_grounded() -> None:
    payload = FormGenerateRequest(description="   ", fields=[_field()])

    assert payload.description == ""


def test_empty_field_catalog_is_rejected() -> None:
    with pytest.raises(ValidationError, match="at least one field"):
        FormGenerateRequest(fields=[])


def test_description_only_request_is_still_valid() -> None:
    payload = FormGenerateRequest(description="Create a contact form")

    assert payload.fields is None
    assert payload.description == "Create a contact form"


@pytest.mark.asyncio
async def test_grounded_generation_accepts_an_empty_description(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_layout(fields: list[dict], description: str) -> dict:
        captured["fields"] = fields
        captured["description"] = description
        return {
            "form_name": "Grounded Form",
            "form_control_id": "TEST-001",
            "sections": [
                {
                    "section_id": "s1",
                    "section_title": "Student",
                    "fields": [
                        {
                            "field_id": "full_name",
                            "label": "Full Name",
                            "data_type": "string",
                            "ui_component": "text_input",
                            "required": True,
                            "options": None,
                        }
                    ],
                }
            ],
        }

    def fake_blueprint(description: str) -> dict:
        raise AssertionError("description-only generation should not be used")

    monkeypatch.setattr(forms_router, "generate_form_layout", fake_layout)
    monkeypatch.setattr(forms_router, "generate_form_blueprint", fake_blueprint)

    result = await forms_router.generate_form(
        FormGenerateRequest(fields=[_field()]),
        current_user={},
        db=None,
    )

    assert captured["description"] == ""
    assert [field["key"] for field in captured["fields"]] == ["full_name"]
    assert result.warnings == []
    blocks = result.document_json["sections"][0]["blocks"]
    assert [block.get("field_key") for block in blocks] == ["full_name"]
