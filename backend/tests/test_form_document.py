from __future__ import annotations

from types import SimpleNamespace

from app.schemas.extraction_schemas import ExtractionSchemaField
from app.services.form_document import (
    blueprint_field_to_block,
    blueprint_to_document,
    document_to_fields,
    flat_field_to_block,
    normalize_field_key,
    schema_to_document,
)


def test_normalize_field_key():
    assert normalize_field_key("Student Name") == "student_name"
    assert normalize_field_key("  LRN No.  ") == "lrn_no"
    assert normalize_field_key("date-of-birth") == "date_of_birth"
    assert normalize_field_key("") == ""


def test_blueprint_field_to_block():
    block = blueprint_field_to_block(
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
    assert block["type"] == "field"
    assert block["field_key"] == "enrollment_status"
    assert block["label"] == "Enrollment Status"
    assert block["ui_component"] == "radio_group"
    assert block["required"] is True
    assert block["options"] == [
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

    assert doc["header"] == []
    assert doc["footer"] == []
    # heading + field, heading + field
    assert [b["type"] for b in doc["body"]] == ["heading", "field", "heading", "field"]
    assert doc["body"][0]["content"] == "STUDENT PERSONAL DATA"
    assert doc["body"][1]["field_key"] == "full_name"
    assert doc["body"][3]["field_key"] == "gender"


def test_document_to_fields_prefill():
    doc = {
        "header": [],
        "footer": [],
        "body": [
            {"type": "heading", "level": 2, "content": "PERSONAL"},
            {"type": "field", "field_key": "full_name", "label": "Full Name", "ui_component": "text_input", "required": True},
            {
                "type": "field",
                "field_key": "gender",
                "label": "Sex",
                "ui_component": "radio_group",
                "required": False,
                "options": [{"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}],
            },
            {
                "type": "field",
                "field_key": "interests",
                "label": "Interests",
                "ui_component": "checkbox_group",
                "required": False,
                "options": [{"value": "sports", "label": "Sports"}],
            },
        ],
    }

    fields = document_to_fields(doc)

    assert [f["key"] for f in fields] == ["full_name", "gender", "interests"]
    assert fields[0]["type"] == "string"
    assert fields[0]["required"] is True
    assert fields[1]["type"] == "select"
    assert fields[2]["type"] == "multi-select"

    # Every produced field must validate as an ExtractionSchemaField.
    for f in fields:
        ExtractionSchemaField(**f)


def test_document_to_fields_dedups_duplicate_keys():
    doc = {
        "body": [
            {"type": "field", "field_key": "name", "label": "Name", "ui_component": "text_input", "required": False},
            {"type": "field", "field_key": "name", "label": "Name Again", "ui_component": "text_input", "required": False},
        ]
    }
    fields = document_to_fields(doc)
    assert len(fields) == 1


def test_schema_to_document_from_blueprint_sections():
    schema = SimpleNamespace(
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
    assert [b["type"] for b in doc["body"]] == ["heading", "field"]
    assert doc["body"][0]["content"] == "CONTACT DETAILS"
    assert doc["body"][1]["field_key"] == "email"


def test_schema_to_document_from_flat_fields_json():
    schema = SimpleNamespace(
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
    assert [b["type"] for b in doc["body"]] == ["heading", "field", "field"]
    assert doc["body"][0]["content"] == "ADDRESS"
    assert doc["body"][1]["field_key"] == "address"
    assert doc["body"][2]["ui_component"] == "date_picker"


def test_flat_field_to_block():
    block = flat_field_to_block(
        {
            "key": "shs_track",
            "description": "SHS Track",
            "ui_component": "dropdown",
            "required": True,
            "options": [{"value": "stem", "label": "STEM"}],
        }
    )
    assert block == {
        "type": "field",
        "field_key": "shs_track",
        "label": "SHS Track",
        "ui_component": "dropdown",
        "required": True,
        "options": [{"value": "stem", "label": "STEM"}],
    }
