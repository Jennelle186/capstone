"""Phase 5 form ↔ schema lifecycle helpers.

Persistence of form provenance (``extraction_schema_id``) happens in the admin
forms router. This module owns the two derived operations:

- **Draft schema from form** — pre-fill a draft ``ExtractionSchema`` from a
  form's ``field`` blocks (``document_to_fields``).
- **Explicit sync** — diff a form's field keys against its linked schema,
  preserve analytics metadata + stable ids, and block deletion of fields that
  are analytics-marked or referenced by a computed field.
"""

from __future__ import annotations

from typing import Any

from ..database import SessionDep
from ..models import ExtractionSchema, ExtractionSchemaStatus, Form
from .form_document import document_to_fields


def _field_shape_changed(schema_field: dict[str, Any], form_field: dict[str, Any]) -> bool:
    for attr in ("type", "description", "required", "ui_component", "options"):
        if schema_field.get(attr) != form_field.get(attr):
            return True
    return False


def _merge_field(schema_field: dict[str, Any], form_field: dict[str, Any]) -> dict[str, Any]:
    """Update a schema field's presentation shape from the form, preserving its
    stable id and analytics/computation metadata."""
    return {
        **schema_field,
        "type": form_field.get("type", schema_field.get("type", "string")),
        "description": form_field.get("description", schema_field.get("description", "")),
        "required": bool(form_field.get("required", schema_field.get("required", False))),
        "ui_component": form_field.get("ui_component", schema_field.get("ui_component")),
        "options": form_field.get("options", schema_field.get("options")),
        "section_id": form_field.get("section_id", schema_field.get("section_id")),
        "section_title": form_field.get("section_title", schema_field.get("section_title")),
    }


def diff_and_merge_schema_fields(
    form_fields: list[dict[str, Any]],
    schema_fields: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return the merged schema fields plus the add/update/remove summary.

    ``form_fields`` are ``document_to_fields``-shaped dicts; ``schema_fields``
    are the current ``ExtractionSchema.fields_json`` entries (which carry the
    analytics/computation metadata).
    """
    form_by_key = {f["key"]: f for f in form_fields}
    schema_by_key = {f["key"]: f for f in schema_fields if isinstance(f, dict) and f.get("key")}

    form_keys = set(form_by_key)
    schema_keys = set(schema_by_key)

    added = sorted(form_keys - schema_keys)
    removed = sorted(schema_keys - form_keys)
    updated = sorted(
        key for key in (form_keys & schema_keys)
        if _field_shape_changed(schema_by_key[key], form_by_key[key])
    )

    # Block removals of fields that are analytics-marked or referenced by a
    # computed field's dependency list (dependencies reference field ids).
    id_to_key = {f["id"]: f["key"] for f in schema_fields if isinstance(f, dict) and f.get("id")}
    referenced_keys: set[str] = set()
    for field in schema_fields:
        if not isinstance(field, dict):
            continue
        if not field.get("is_computed"):
            continue
        for dep in (field.get("computation") or {}).get("dependencies", []) or []:
            dep_key = id_to_key.get(dep)
            if dep_key:
                referenced_keys.add(dep_key)

    blocked_removals = sorted(
        key for key in removed
        if schema_by_key[key].get("is_analytics") or key in referenced_keys
    )
    blocked_set = set(blocked_removals)
    actually_removed = [key for key in removed if key not in blocked_set]

    merged: list[dict[str, Any]] = []
    for field in schema_fields:
        if not isinstance(field, dict) or not field.get("key"):
            merged.append(field)
            continue
        key = field["key"]
        if key in form_by_key:
            merged.append(_merge_field(field, form_by_key[key]))
        elif key in blocked_set:
            merged.append(field)  # keep (analytics/computation dependency)
        # else: dropped (removed)

    for field in form_fields:
        if field.get("key") in added:
            merged.append({**field, "is_analytics": False})

    return {
        "fields": merged,
        "added": added,
        "updated": updated,
        "removed": actually_removed,
        "blocked_removals": blocked_removals,
    }


async def create_draft_schema_from_form(db: SessionDep, form: Form) -> ExtractionSchema:
    """Create a draft extraction schema from a form's field blocks and link it
    back to the form (provenance)."""
    fields = document_to_fields(form.document_json or {})

    draft_name = f"{form.name} (Draft)"[:120]
    schema = ExtractionSchema(
        name=draft_name,
        description=form.description,
        schema_json={},
        fields_json=fields,
        document_type_id=form.document_type_id,
        status=ExtractionSchemaStatus.DRAFT,
    )
    db.add(schema)
    await db.flush()
    form.extraction_schema_id = schema.id
    await db.commit()
    await db.refresh(schema)
    return schema
