from __future__ import annotations

import re
import uuid
from typing import Any

# ── Helpers ────────────────────────────────────────────────────────────

_FIELD_KEY_RE = re.compile(r"[^a-z0-9_]+")


def normalize_field_key(value: str) -> str:
    """Normalize a human label/field_id into a stable snake_case key.

    Mirrors the ``ExtractionSchemaField.key`` validator so keys produced here
    are always valid for the schema model.
    """
    normalized = value.strip().lower().replace(" ", "_")
    normalized = _FIELD_KEY_RE.sub("_", normalized).strip("_")
    return normalized


def _new_id() -> str:
    return str(uuid.uuid4())


def _normalize_options(raw: Any) -> list[dict[str, str]] | None:
    if not isinstance(raw, list):
        return None
    out = []
    for opt in raw:
        if isinstance(opt, dict):
            out.append(
                {"value": str(opt.get("value", "")), "label": str(opt.get("label", ""))}
            )
    return out or None


def _type_for(ui_component: str) -> str:
    """Map a UI widget to an ExtractionSchemaField `type`."""
    if ui_component == "checkbox_group":
        return "multi-select"
    if ui_component in ("radio_group", "dropdown"):
        return "select"
    return "string"


# ── Field specs (structured documents) ─────────────────────────────────
#
# A form ``document_json`` is a versioned, structured document:
#
#     {
#         "version": 1,
#         "creation_mode": "structured",
#         "title": ..., "subtitle": ..., "instructions": ...,
#         "sections": [
#             {"id": ..., "heading": ..., "fields": [
#                 {"id": ..., "field_key": ..., "label": ...,
#                  "ui_component": ..., "required": ..., "options": ...}
#             ]}
#         ],
#         "signatureLabel": ..., "footer": ...,
#     }


def _field_spec(
    field_key: str,
    label: str,
    ui_component: str,
    required: bool,
    options: Any,
    field_id: str | None = None,
) -> dict[str, Any]:
    return {
        "id": field_id or _new_id(),
        "field_key": field_key,
        "label": label,
        "ui_component": ui_component,
        "required": required,
        "options": _normalize_options(options),
    }


def blueprint_field_to_spec(bf: dict[str, Any]) -> dict[str, Any]:
    """Convert one blueprint field (AdminBuilderField) into a field spec."""
    field_id = str(bf.get("field_id", "") or "")
    label = str(bf.get("label", "") or "")
    ui_component = str(bf.get("ui_component", "text_input") or "text_input")
    return _field_spec(
        normalize_field_key(field_id or label),
        label,
        ui_component,
        bool(bf.get("required", False)),
        bf.get("options"),
    )


def flat_field_to_spec(field: dict[str, Any]) -> dict[str, Any]:
    """Convert a flat ExtractionSchemaField dict into a field spec."""
    return _field_spec(
        str(field.get("key", "") or ""),
        str(field.get("description", "") or ""),
        str(field.get("ui_component", "text_input") or "text_input"),
        bool(field.get("required", False)),
        field.get("options"),
    )


# ── Blueprint → document ───────────────────────────────────────────────


def blueprint_to_document(blueprint: dict[str, Any]) -> dict[str, Any]:
    """Convert an AdminSchemaBlueprint into a structured form ``document_json``."""
    sections: list[dict[str, Any]] = []
    for section in blueprint.get("sections", []) or []:
        if not isinstance(section, dict):
            continue
        heading = str(section.get("section_title", "") or "").strip() or "Section"
        specs = [
            blueprint_field_to_spec(bf)
            for bf in section.get("fields", []) or []
            if isinstance(bf, dict)
        ]
        sections.append({"id": _new_id(), "heading": heading, "fields": specs})

    title = str(blueprint.get("form_name", "") or "").strip() or "Untitled Form"
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": title,
        "subtitle": "",
        "instructions": "",
        "sections": sections,
        "signatureLabel": "Signature over Printed Name",
        "footer": "",
    }


# ── Document → fields (pre-fill) ───────────────────────────────────────


def _append_schema_field(
    fields: list[dict[str, Any]],
    seen: set[str],
    spec: dict[str, Any],
    section_id: str | None = None,
    section_title: str | None = None,
) -> None:
    key = normalize_field_key(str(spec.get("field_key", "") or spec.get("label", "") or ""))
    if not key or key in seen:
        return
    seen.add(key)

    ui_component = str(spec.get("ui_component", "text_input") or "text_input")
    fields.append(
        {
            "id": f"gen_{len(fields)}_{key}",
            "key": key,
            "type": _type_for(ui_component),
            "description": str(spec.get("label", "") or ""),
            "required": bool(spec.get("required", False)),
            "ui_component": ui_component,
            "hierarchy_level": 1,
            "parent_field_id": None,
            "options": _normalize_options(spec.get("options")),
            "section_id": section_id,
            "section_title": section_title,
            "is_analytics": False,
        }
    )


def _legacy_field_specs(nodes: Any) -> list[dict[str, Any]]:
    """Best-effort extraction of field specs from a legacy ProseMirror body."""
    out: list[dict[str, Any]] = []
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "field":
            attrs = node.get("attrs")
            if isinstance(attrs, dict):
                out.append(attrs)
        content = node.get("content")
        if isinstance(content, list):
            out.extend(_legacy_field_specs(content))
    return out


def document_to_fields(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract fields from a document into ExtractionSchemaField-shaped dicts.

    This is the one-time "pre-fill" that populates ``fields_json`` when a form is
    saved as an extraction schema. Handles the structured v1 shape and, as a
    fallback, legacy ProseMirror-bodied documents.
    """
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()

    sections = document.get("sections") if isinstance(document, dict) else None
    if isinstance(sections, list):
        for section in sections:
            if not isinstance(section, dict):
                continue
            section_id = str(section.get("id", "") or "") or None
            section_title = str(section.get("heading", "") or "") or None
            for spec in section.get("fields", []) or []:
                if isinstance(spec, dict):
                    _append_schema_field(fields, seen, spec, section_id, section_title)
        return fields

    # Legacy fallback: ProseMirror body.
    body = document.get("body") if isinstance(document, dict) else None
    content = body.get("content") if isinstance(body, dict) else body
    for spec in _legacy_field_specs(content):
        _append_schema_field(fields, seen, spec)
    return fields


# ── Schema → document (legacy materialization) ─────────────────────────


def schema_to_document(schema: Any) -> dict[str, Any]:
    """Materialize a structured form ``document_json`` from an ExtractionSchema.

    Prefers blueprint ``sections`` stored in ``schema_json`` (schemas created
    from a document/description). Falls back to grouping ``fields_json`` by
    section when ``schema_json`` is a flat JSON-schema (schemas hand-built in the
    admin builder).
    """
    schema_json = getattr(schema, "schema_json", None) or {}
    sections_data = schema_json.get("sections") if isinstance(schema_json, dict) else None

    sections: list[dict[str, Any]] = []
    if sections_data:
        for section in sections_data:
            if not isinstance(section, dict):
                continue
            heading = str(section.get("section_title", "") or "").strip() or "Section"
            specs = [
                blueprint_field_to_spec(bf)
                for bf in section.get("fields", []) or []
                if isinstance(bf, dict)
            ]
            sections.append({"id": _new_id(), "heading": heading, "fields": specs})
    else:
        fields_json = getattr(schema, "fields_json", None) or []
        grouped: dict[str, list[dict[str, Any]]] = {}
        for f in fields_json:
            if not isinstance(f, dict):
                continue
            title = str(f.get("section_title") or f.get("section_id") or "").strip() or "Section"
            grouped.setdefault(title, []).append(f)
        for title, fields in grouped.items():
            specs = [flat_field_to_spec(f) for f in fields]
            sections.append({"id": _new_id(), "heading": title, "fields": specs})

    name = str(getattr(schema, "name", "") or "").strip() or "Untitled Form"
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": name,
        "subtitle": "",
        "instructions": "",
        "sections": sections,
        "signatureLabel": "Signature over Printed Name",
        "footer": "",
    }
