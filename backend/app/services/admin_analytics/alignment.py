from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select

from ...database import SessionDep
from ...models import ExtractionSchema, SchoolYear, SchoolYearRequirement


def _option_signature(field: dict[str, Any]) -> tuple[str, ...] | None:
    """Return a stable, order-independent signature of a field's option values."""
    options = field.get("options")
    if not isinstance(options, list) or not options:
        return None
    values: list[str] = []
    for opt in options:
        if isinstance(opt, dict):
            values.append(str(opt.get("value", "")))
        else:
            values.append(str(opt))
    return tuple(sorted(values))


def build_alignment_report(
    schemas: list[dict[str, Any]],
    schema_year_names: dict[str, list[str]],
) -> dict[str, Any]:
    """Compose the cross-year alignment report from pre-queried data.

    Pure (no DB access) so it can be unit-tested directly. Groups every
    analytics-enabled field by its canonical key (falling back to the field
    key), then classifies each group:

    - ``isolated`` — key used in at most one school year
    - ``diverges`` — key used in 2+ years but field types or option lists differ
    - ``aligned`` — key used in 2+ years with consistent type and options
    """
    groups: dict[str, dict[str, Any]] = {}

    for schema in schemas:
        schema_id = str(schema["id"])
        schema_name = str(schema.get("name", "") or "")
        year_names = list(schema_year_names.get(schema_id, []))
        for field in schema.get("fields") or []:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue
            ck = field.get("canonical_key") or field.get("key")
            if not ck:
                continue

            detail = {
                "field_key": str(field.get("key", "") or ""),
                "field_label": str(field.get("analytics_label") or field.get("key", ck)),
                "field_type": str(field.get("type", "string")),
                "schema_name": schema_name,
                "school_year_names": list(year_names),
            }

            group = groups.setdefault(
                ck,
                {
                    "canonical_key": ck,
                    "field_details": [],
                    "field_types": set(),
                    "option_signatures": set(),
                },
            )
            group["field_details"].append(detail)
            group["field_types"].add(detail["field_type"])
            signature = _option_signature(field)
            if signature is not None:
                group["option_signatures"].add(signature)

    result_groups: list[dict[str, Any]] = []
    isolated_keys = 0
    diverged_keys = 0

    for ck, group in groups.items():
        year_names_set: set[str] = set()
        for detail in group["field_details"]:
            year_names_set.update(detail["school_year_names"])
        year_names = sorted(year_names_set)
        year_count = len(year_names)

        status = "aligned"
        divergences: list[str] = []
        if year_count <= 1:
            status = "isolated"
            isolated_keys += 1
        else:
            field_types = sorted(group["field_types"])
            if len(field_types) > 1:
                divergences.append("field_type differs: " + " vs ".join(field_types))
            if len(group["option_signatures"]) > 1:
                divergences.append("options differ")
            if divergences:
                status = "diverges"
                diverged_keys += 1

        result_groups.append(
            {
                "canonical_key": ck,
                "field_details": group["field_details"],
                "school_year_count": year_count,
                "school_year_names": year_names,
                "status": status,
                "divergences": divergences,
            }
        )

    result_groups.sort(key=lambda g: g["canonical_key"])
    return {
        "groups": result_groups,
        "total_keys": len(result_groups),
        "isolated_keys": isolated_keys,
        "diverged_keys": diverged_keys,
    }


async def get_alignment_report(db: SessionDep) -> dict[str, Any]:
    """Load schemas + school-year requirements and build the alignment report."""
    schemas = (await db.execute(select(ExtractionSchema))).scalars().all()

    syr_rows = (
        await db.execute(
            select(SchoolYearRequirement, SchoolYear.name).join(
                SchoolYear,
                SchoolYearRequirement.school_year_id == SchoolYear.id,
            )
        )
    ).all()

    schema_year_names: dict[str, list[str]] = defaultdict(list)
    for syr, year_name in syr_rows:
        if syr.extraction_schema_id and year_name:
            schema_year_names[str(syr.extraction_schema_id)].append(year_name)

    schema_rows = [
        {
            "id": str(schema.id),
            "name": schema.name,
            "fields": schema.fields_json or [],
        }
        for schema in schemas
    ]

    return build_alignment_report(schema_rows, schema_year_names)
