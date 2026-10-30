from __future__ import annotations

from types import SimpleNamespace

from app.schemas.extraction_schemas import ExtractionSchemaField
from app.services.form_document import (
    blueprint_field_to_spec,
    blueprint_to_document,
    document_to_fields,
    flat_field_to_spec,
    ground_field_keys,
    normalize_field_key,
    schema_to_document,
)


def test_normalize_field_key():
    assert normalize_field_key("Student Name") == "student_name"
    assert normalize_field_key("  LRN No.  ") == "lrn_no"
    assert normalize_field_key("date-of-birth") == "date_of_birth"
    assert normalize_field_key("") == ""


def test_blueprint_field_to_spec():
    spec = blueprint_field_to_spec(
        {
            "field_id": "enrollment_status",
            "label": "Enrollment Status",
            "ui_component": "radio_group",
            "required": True,
            "options": [
                {"value": "freshman", "label": "Freshman"},
                {"value": "transferee", "label": "Transferee"},
            ],
        }
    )
    assert isinstance(spec["id"], str) and spec["id"]
    assert spec["field_key"] == "enrollment_status"
    assert spec["label"] == "Enrollment Status"
    assert spec["ui_component"] == "radio_group"
    assert spec["required"] is True
    assert spec["options"] == [
        {"value": "freshman", "label": "Freshman"},
        {"value": "transferee", "label": "Transferee"},
    ]


def test_blueprint_to_document():
    blueprint = {
        "form_name": "Admission Form",
        "form_control_id": "WMSU-AO-FR-001",
        "sections": [
            {
                "section_id": "personal",
                "section_title": "STUDENT PERSONAL DATA",
                "fields": [
                    {"field_id": "full_name", "label": "Full Name", "ui_component": "text_input", "required": True},
                ],
            },
            {
                "section_id": "academic",
                "section_title": "ACADEMIC INFORMATION",
                "fields": [
                    {
                        "field_id": "gender",
                        "label": "Sex",
                        "ui_component": "radio_group",
                        "required": False,
                        "options": [{"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}],
                    },
                ],
            },
        ],
    }

    doc = blueprint_to_document(blueprint)

    assert doc["version"] == 1
    assert doc["creation_mode"] == "structured"
    assert doc["title"] == "Admission Form"
    assert [s["heading"] for s in doc["sections"]] == ["STUDENT PERSONAL DATA", "ACADEMIC INFORMATION"]
    assert doc["sections"][0]["fields"][0]["field_key"] == "full_name"
    assert doc["sections"][1]["fields"][0]["field_key"] == "gender"


def test_document_to_fields_prefill():
    doc = {
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
                    },
                    {
                        "id": "f2",
                        "field_key": "gender",
                        "label": "Sex",
                        "ui_component": "radio_group",
                        "required": False,
                        "options": [{"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}],
                    },
                    {
                        "id": "f3",
                        "field_key": "interests",
                        "label": "Interests",
                        "ui_component": "checkbox_group",
                        "required": False,
                        "options": [{"value": "sports", "label": "Sports"}],
                    },
                ],
            }
        ],
    }

    fields = document_to_fields(doc)

    assert [f["key"] for f in fields] == ["full_name", "gender", "interests"]
    assert fields[0]["type"] == "string"
    assert fields[0]["required"] is True
    assert fields[0]["section_title"] == "PERSONAL"
    assert fields[1]["type"] == "select"
    assert fields[2]["type"] == "multi-select"

    for f in fields:
        ExtractionSchemaField(**f)


def test_document_to_fields_dedups_duplicate_keys():
    doc = {
        "version": 1,
        "creation_mode": "structured",
        "title": "X",
        "sections": [
            {
                "id": "sec-1",
                "heading": "S",
                "fields": [
                    {"id": "f1", "field_key": "name", "label": "Name", "ui_component": "text_input", "required": False, "options": None},
                    {"id": "f2", "field_key": "name", "label": "Name Again", "ui_component": "text_input", "required": False, "options": None},
                ],
            }
        ],
    }
    fields = document_to_fields(doc)
    assert len(fields) == 1


def test_schema_to_document_from_blueprint_sections():
    schema = SimpleNamespace(
        name="Contact Form",
        schema_json={
            "sections": [
                {
                    "section_title": "CONTACT DETAILS",
                    "fields": [
                        {"field_id": "email", "label": "Email", "ui_component": "text_input", "required": True},
                    ],
                }
            ]
        },
        fields_json=[],
    )
    doc = schema_to_document(schema)
    assert doc["version"] == 1
    assert doc["creation_mode"] == "structured"
    assert doc["sections"][0]["heading"] == "CONTACT DETAILS"
    assert doc["sections"][0]["fields"][0]["field_key"] == "email"


def test_schema_to_document_from_flat_fields_json():
    schema = SimpleNamespace(
        name="Address Form",
        schema_json={"type": "object", "properties": {}},  # flat, no sections
        fields_json=[
            {
                "key": "address",
                "description": "Home Address",
                "ui_component": "text_input",
                "required": False,
                "section_title": "ADDRESS",
            },
            {
                "key": "birth_date",
                "description": "Birth Date",
                "ui_component": "date_picker",
                "required": False,
                "section_title": "ADDRESS",
            },
        ],
    )
    doc = schema_to_document(schema)
    section = doc["sections"][0]
    assert section["heading"] == "ADDRESS"
    assert [f["field_key"] for f in section["fields"]] == ["address", "birth_date"]
    assert section["fields"][1]["ui_component"] == "date_picker"


def test_flat_field_to_spec():
    spec = flat_field_to_spec(
        {
            "key": "shs_track",
            "description": "SHS Track",
            "ui_component": "dropdown",
            "required": True,
            "options": [{"value": "stem", "label": "STEM"}],
        }
    )
    assert spec["field_key"] == "shs_track"
    assert spec["label"] == "SHS Track"
    assert spec["ui_component"] == "dropdown"
    assert spec["required"] is True
    assert spec["options"] == [{"value": "stem", "label": "STEM"}]


def _grounded_doc() -> dict:
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": "X",
        "sections": [
            {
                "id": "s1",
                "heading": "PERSONAL",
                "fields": [
                    {"id": "f1", "field_key": "full_name", "label": "Full Name", "ui_component": "text_input", "required": True, "options": None},
                    {"id": "f2", "field_key": "invented", "label": "Invented", "ui_component": "text_input", "required": False, "options": None},
                ],
            }
        ],
        "signatureLabel": "Sig",
    }


def test_ground_field_keys_flags_unknown_keys():
    result, warnings = ground_field_keys(_grounded_doc(), {"full_name"})
    blocks = result["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == ["field", "unresolved_field"]
    assert blocks[0]["field_key"] == "full_name"
    assert blocks[1]["field_key"] == "invented"
    assert len(warnings) == 1
    assert "invented" in warnings[0]


def test_ground_field_keys_keeps_known_keys():
    result, warnings = ground_field_keys(_grounded_doc(), {"full_name", "invented"})
    blocks = result["sections"][0]["blocks"]
    assert [b["type"] for b in blocks] == ["field", "field"]
    assert warnings == []


def test_ground_field_keys_normalizes_to_blocks():
    result, _ = ground_field_keys(_grounded_doc(), {"full_name"})
    section = result["sections"][0]
    assert section["fields"] == []
    assert section["blocks"][0]["type"] == "field"
