from __future__ import annotations

from typing import Any

from ..schemas.extraction_schemas import FieldOption


def blueprint_to_fields(
    blueprint: dict[str, Any],
    source_file_name: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Convert an AdminSchemaBlueprint into schema_json + flat fields_json.

    The schema_json stores the full blueprint for the frontend tree renderer.
    fields_json is a flat list of ExtractionSchemaFields with hierarchy/options
    preserved as optional attributes.
    """
    sections = blueprint.get("sections", [])
    fields: list[dict[str, Any]] = []
    auto_id = 0

    for section in sections:
        section_id = section.get("section_id", f"section_{auto_id}")
        section_title = section.get("section_title", "")
        for bf in section.get("fields", []):
            field_id = bf.get("field_id", f"field_{auto_id}")
            label = bf.get("label", "")
            data_type = bf.get("data_type", "string")
            mapped_type = data_type if data_type in ("string", "number", "integer", "boolean", "select", "multi-select") else "string"
            ui_component = bf.get("ui_component", "text_input")
            hierarchy_level = bf.get("hierarchy_level", 1)
            parent_field_id = bf.get("parent_field_id")
            raw_options = bf.get("options")
            options = []
            if isinstance(raw_options, list):
                for opt in raw_options:
                    if isinstance(opt, dict):
                        options.append(
                            FieldOption(
                                value=str(opt.get("value", "")),
                                label=str(opt.get("label", "")),
                            )
                        )
                if mapped_type == "string" and len(options) > 0:
                    mapped_type = "multi-select" if ui_component == "checkbox_group" else "select"

            fields.append({
                "id": f"gen_{auto_id}_{field_id}",
                "key": field_id,
                "type": mapped_type,
                "description": label,
                "required": bf.get("required", False),
                "ui_component": ui_component,
                "hierarchy_level": hierarchy_level,
                "parent_field_id": parent_field_id,
                "options": [o.model_dump() for o in options] if options else None,
                "section_id": section_id,
                "section_title": section_title,
                "is_analytics": False,
            })
            auto_id += 1

    schema_json: dict[str, Any] = {
        "type": "AdminSchemaBlueprint",
        "form_name": blueprint.get("form_name", ""),
        "form_control_id": blueprint.get("form_control_id", ""),
        "sections": blueprint.get("sections", []),
        "source_file_name": source_file_name,
    }

    return schema_json, fields
