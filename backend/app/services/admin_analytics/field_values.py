from __future__ import annotations

from ...models import DocumentSubmission


def extract_values(
    submissions: list[DocumentSubmission],
    field_id: str,
    field_type: str,
    field_key: str = "",
) -> list:
    values: list = []
    for sub in submissions:
        extracted = sub.extracted_data or {}
        entry = extracted.get(field_id)
        if entry is None and field_key:
            entry = extracted.get(field_key)
        if entry is None:
            continue
        raw = entry.get("value") if isinstance(entry, dict) else entry
        if raw is None:
            continue
        if field_type == "multi-select" and isinstance(raw, list):
            values.append(raw)
        elif field_type in ("number", "integer") and not isinstance(raw, (int, float)):
            try:
                values.append(float(raw))
            except (ValueError, TypeError):
                continue
        else:
            values.append(raw)
    return values