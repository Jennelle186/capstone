from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def apply_computed_fields(schema_fields: list[dict], extracted_data: dict) -> dict:
    """Evaluate computed field expressions against extracted data.

    For each schema field with ``is_computed=True``, gather numeric values
    from its dependency field IDs and apply the configured operation
    (average, sum, max, or min).  Results are injected into the returned
    dict with ``is_computed`` metadata so the frontend can render them as
    read-only.

    *schema_fields* must be the full ``fields_json`` list so that both
    the computed field definitions and their dependencies are present.
    """
    result = dict(extracted_data)
    field_map = {f["id"]: f for f in schema_fields}

    for field in schema_fields:
        if not field.get("is_computed"):
            continue
        comp = field.get("computation")
        if not comp:
            continue

        op = comp.get("operation")
        dep_ids = comp.get("dependencies", [])

        values: list[float] = []
        for dep_id in dep_ids:
            dep_data = result.get(dep_id, {})
            if not isinstance(dep_data, dict):
                continue
            val = dep_data.get("value")
            if val is None or val == "":
                continue
            try:
                values.append(float(val))
            except (ValueError, TypeError):
                pass

        if not values:
            continue

        if op == "average":
            computed = sum(values) / len(values)
        elif op == "sum":
            computed = sum(values)
        elif op == "max":
            computed = max(values)
        elif op == "min":
            computed = min(values)
        else:
            continue

        computed = round(computed, 2)

        result[field["id"]] = {
            "value": str(computed),
            "confidence": 1.0,
            "needs_review": False,
            "source_key": "[computed]",
            "is_computed": True,
        }

    return result
