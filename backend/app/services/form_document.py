from __future__ import annotations

import re
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


# ── Blueprint → document ───────────────────────────────────────────────


def blueprint_field_to_block(bf: dict[str, Any]) -> dict[str, Any]:
    """Convert one blueprint field (AdminBuilderField) into a `field` block."""
    field_id = str(bf.get("field_id", "") or "")
    label = str(bf.get("label", "") or "")
    ui_component = str(bf.get("ui_component", "text_input") or "text_input")
    return {
        "type": "field",
        "field_key": normalize_field_key(field_id or label),
        "label": label,
        "ui_component": ui_component,
        "required": bool(bf.get("required", False)),
        "options": _normalize_options(bf.get("options")),
    }


def blueprint_to_document(blueprint: dict[str, Any]) -> dict[str, Any]:
    """Convert an AdminSchemaBlueprint into a form ``document_json``.

    Each section becomes a heading block followed by its field blocks.
    ``header``/``footer`` start empty (the admin fills them in the editor).
    """
    body: list[dict[str, Any]] = []
    for section in blueprint.get("sections", []) or []:
        if not isinstance(section, dict):
            continue
        title = str(section.get("section_title", "") or "").strip()
        if title:
            body.append({"type": "heading", "level": 2, "content": title})
        for bf in section.get("fields", []) or []:
            if isinstance(bf, dict):
                body.append(blueprint_field_to_block(bf))
    return {"header": [], "footer": [], "body": body}


# ── Document → fields (pre-fill) ───────────────────────────────────────


def _walk_field_blocks(blocks: list[Any]) -> list[dict[str, Any]]:
    """Recursively collect `field` blocks from a block list (incl. columns)."""
    out: list[dict[str, Any]] = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "field":
            out.append(block)
        children = block.get("children")
        if isinstance(children, list):
            out.extend(_walk_field_blocks(children))
    return out


def flat_field_to_block(field: dict[str, Any]) -> dict[str, Any]:
    """Convert a flat ExtractionSchemaField dict into a `field` block."""
    return {
        "type": "field",
        "field_key": str(field.get("key", "") or ""),
        "label": str(field.get("description", "") or ""),
        "ui_component": str(field.get("ui_component", "text_input") or "text_input"),
        "required": bool(field.get("required", False)),
        "options": _normalize_options(field.get("options")),
    }


def document_to_fields(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract field blocks from a document into ExtractionSchemaField-shaped dicts.

    This is the one-time "pre-fill" that populates ``fields_json`` when a form is
    saved as an extraction schema.
    """
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()
    auto_id = 0

    for block in _walk_field_blocks(document.get("body")):
        key = normalize_field_key(str(block.get("field_key", "") or block.get("label", "") or ""))
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)

        options = _normalize_options(block.get("options"))
        ui_component = str(block.get("ui_component", "text_input") or "text_input")

        fields.append(
            {
                "id": f"gen_{auto_id}_{key}",
                "key": key,
                "type": _type_for(ui_component),
                "description": str(block.get("label", "") or ""),
                "required": bool(block.get("required", False)),
                "ui_component": ui_component,
                "hierarchy_level": 1,
                "parent_field_id": None,
                "options": options,
                "section_id": None,
                "section_title": None,
                "is_analytics": False,
            }
        )
        auto_id += 1

    return fields


# ── Schema → document (legacy materialization) ─────────────────────────


def schema_to_document(schema: Any) -> dict[str, Any]:
    """Materialize a form ``document_json`` from an existing ExtractionSchema.

    Prefers the blueprint ``sections`` stored in ``schema_json`` (schemas created
    from a document/description). Falls back to grouping ``fields_json`` by
    section when ``schema_json`` is a flat JSON-schema (schemas hand-built in the
    admin builder).
    """
    schema_json = getattr(schema, "schema_json", None) or {}
    sections = schema_json.get("sections") if isinstance(schema_json, dict) else None

    body: list[dict[str, Any]] = []
    if sections:
        for section in sections:
            if not isinstance(section, dict):
                continue
            title = str(section.get("section_title", "") or "").strip()
            if title:
                body.append({"type": "heading", "level": 2, "content": title})
            for bf in section.get("fields", []) or []:
                if isinstance(bf, dict):
                    body.append(blueprint_field_to_block(bf))
    else:
        fields_json = getattr(schema, "fields_json", None) or []
        grouped: dict[str | None, list[dict[str, Any]]] = {}
        for f in fields_json:
            title = (f.get("section_title") or f.get("section_id") or None) if isinstance(f, dict) else None
            grouped.setdefault(title, []).append(f)
        for title, fields in grouped.items():
            if title:
                body.append({"type": "heading", "level": 2, "content": str(title)})
            for f in fields:
                body.append(flat_field_to_block(f))

    return {"header": [], "footer": [], "body": body}
