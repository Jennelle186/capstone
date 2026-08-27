from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy import desc, select

from ..database import SessionDep
from ..models import ExtractionSchema, ExtractionSchemaStatus

ANALYTICS_METADATA_KEYS: tuple[str, ...] = (
    "canonical_key",
    "analytics_group",
    "analytics_label",
    "analytics_mode",
    "buckets",
)


def normalize_key(value: str) -> str:
    """Mirror of the frontend `normalizeFieldKey` — trims, lowercases, converts
    whitespace to underscores, and strips non-alphanumeric characters."""
    value = value.strip().lower()
    value = re.sub(r"\s+", "_", value)
    value = re.sub(r"[^a-z0-9_.]", "", value)
    return value


async def inherit_analytics_from_previous(
    db: SessionDep,
    document_type_id: UUID,
    fields: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Copy analytics metadata from the most recent non-draft schema for the
    same document type onto matching generated fields.

    Matching is conservative:

    - Tier 1 (exact key match)        → auto-inherit (``is_analytics: True``)
    - Tier 2 (exact normalized label) → auto-inherit (``is_analytics: True``)
    - Tier 3 (fuzzy/substring match)  → suggest only (``is_analytics: False``,
      but ``canonical_key``/``analytics_group`` pre-filled for the combobox)
    - Tier 4 (no match)               → leave unchanged

    Options are never copied — the generated PDF is the source of truth.
    """
    previous = (
        await db.execute(
            select(ExtractionSchema)
            .where(
                ExtractionSchema.document_type_id == document_type_id,
                ExtractionSchema.status != ExtractionSchemaStatus.DRAFT,
            )
            .order_by(desc(ExtractionSchema.created_at))
            .limit(1)
        )
    ).scalars().first()

    if previous is None:
        return fields

    prev_fields = previous.fields_json or []
    prev_analytics = [f for f in prev_fields if isinstance(f, dict) and f.get("is_analytics")]
    if not prev_analytics:
        return fields

    for gen_field in fields:
        gen_key = str(gen_field.get("key", "") or "")
        gen_label = str(gen_field.get("description", "") or "")
        norm_gen = normalize_key(gen_label)

        best: tuple[int, dict[str, Any]] | None = None

        # Tier 1 — exact key match across all previous fields
        for prev_field in prev_analytics:
            prev_key = str(prev_field.get("key", "") or "")
            if gen_key and prev_key and gen_key == prev_key:
                best = (1, prev_field)
                break

        # Tier 2 — exact normalized label match (only if no Tier 1 match)
        if best is None:
            for prev_field in prev_analytics:
                prev_label = str(
                    prev_field.get("description", "") or prev_field.get("label", "") or ""
                )
                norm_prev = normalize_key(prev_label)
                if norm_gen and norm_prev and norm_gen == norm_prev:
                    best = (2, prev_field)
                    break

        # Tier 3 — fuzzy/substring match (only if no stronger match)
        if best is None and gen_label:
            gen_lower = gen_label.lower()
            for prev_field in prev_analytics:
                prev_label = str(
                    prev_field.get("description", "") or prev_field.get("label", "") or ""
                ).lower()
                if prev_label and (prev_label in gen_lower or gen_lower in prev_label):
                    best = (3, prev_field)
                    break

        if best is None:
            continue

        tier, prev_field = best
        if tier in (1, 2):
            gen_field["is_analytics"] = True
            for key in ANALYTICS_METADATA_KEYS:
                if prev_field.get(key) is not None:
                    gen_field[key] = prev_field[key]
        else:
            # Tier 3 — suggest only, keep analytics disabled
            gen_field["is_analytics"] = False
            gen_field["canonical_key"] = prev_field.get("canonical_key")
            gen_field["analytics_group"] = prev_field.get("analytics_group")

    return fields


def validate_analytics_fields(fields: list[dict[str, Any]]) -> list[str]:
    """Return a list of validation errors for a schema's analytics fields."""
    errors: list[str] = []
    analytics_fields = [f for f in fields if isinstance(f, dict) and f.get("is_analytics")]

    seen: set[str] = set()
    for field in analytics_fields:
        canonical_key = field.get("canonical_key")
        if not canonical_key:
            errors.append(f"Analytics field '{field.get('key', '')}' is missing a canonical_key.")
            continue
        normalized = normalize_key(str(canonical_key))
        if normalized in seen:
            errors.append(f"Duplicate canonical key: '{canonical_key}'.")
        seen.add(normalized)

    return errors
