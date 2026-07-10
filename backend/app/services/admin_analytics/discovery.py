from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from ...models import ExtractionSchema, SchoolYearRequirement


async def get_canonical_keys(db: SessionDep) -> list[dict]:
    schemas = (
        await db.execute(select(ExtractionSchema))
    ).scalars().all()

    canonical_to_school_years: dict[str, set] = defaultdict(set)
    keys_by_canonical: dict[str, dict] = {}

    for schema in schemas:
        fields = schema.fields_json or []
        for field in fields:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue
            ck = field.get("canonical_key") or field.get("key")
            if not ck:
                continue

            if ck not in keys_by_canonical:
                keys_by_canonical[ck] = {
                    "canonical_key": ck,
                    "label": field.get("analytics_label") or field.get("key", ck),
                    "field_type": field.get("type", "string"),
                    "analytics_group": field.get("analytics_group"),
                    "school_year_count": 0,
                }

            syrs = (
                await db.execute(
                    select(SchoolYearRequirement.school_year_id).where(
                        SchoolYearRequirement.extraction_schema_id == schema.id
                    )
                )
            ).scalars().all()
            for sy_id in syrs:
                canonical_to_school_years[ck].add(str(sy_id))

    result = []
    for ck, info in keys_by_canonical.items():
        info["school_year_count"] = len(canonical_to_school_years.get(ck, set()))
        result.append(info)

    return sorted(result, key=lambda x: x["canonical_key"])