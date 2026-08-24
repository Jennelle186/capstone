from __future__ import annotations

from ...models import DocumentSubmission


def extract_values(
    submissions: list[DocumentSubmission],
    field_id: str,
    field_type: str,
    field_key: str = "",
) -> list:
    """Extract the raw values for a given field across a list of submissions.

    Lookup strategy (in order):
    1. ``extracted_data[field_id]`` — the most specific match
    2. ``extracted_data[field_key]`` — fallback when canonical_key differs

    The returned values are lightly coerced:
    - ``"multi-select"`` fields → each value is kept as a list
    - ``"number"`` / ``"integer"`` → coerced to ``float`` (skipped if not parseable)
    - Everything else → kept as-is (string, bool, …)
    """
    values: list = []
    for sub in submissions:
        extracted = sub.extracted_data or {}
        entry = extracted.get(field_id)
        if entry is None and field_key:
            entry = extracted.get(field_key)
        if entry is None and field_key:
            # Fallback: scan all entries for a matching source_key string.
            # This recovers data that was stored under a different field_id
            # (e.g. after a schema change that assigned a new UUID).
            for _k, _v in extracted.items():
                if isinstance(_v, dict) and _v.get("source_key") == field_key:
                    entry = _v
                    break
        if entry is None:
            continue
        raw = entry.get("value") if isinstance(entry, dict) else entry
        if raw is None:
            continue
        if raw == "" or raw == []:
            continue

        if isinstance(raw, str):
            raw = raw.strip()
            if not raw:
                continue

        if field_type == "boolean" and isinstance(raw, str):
            raw_lower = raw.lower()
            if raw_lower in ("true", "yes", "1"):
                raw = True
            elif raw_lower in ("false", "no", "0"):
                raw = False

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
