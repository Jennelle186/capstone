from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from ...models import DocumentType, ExtractionSchema, SchoolYearRequirement


async def get_canonical_keys(db: SessionDep) -> list[dict]:
    """Discover all analytics-enabled canonical keys in the system.

    A canonical key is a stable identifier for a field that may appear in
    multiple extraction schemas across different document types and school
    years.  This function:

    1. Walks every extraction schema for fields tagged ``is_analytics``.
    2. Groups them by canonical key (or field key if no canonical key set).
    3. Counts how many distinct school years each key appears in.
    4. Lists which document types use each key.

    Returns a list sorted alphabetically by canonical key.
    """

    schemas = (
        await db.execute(select(ExtractionSchema))
    ).scalars().all()

    # Phase 1: collect all analytics fields and index them by canonical key.
    canonical_info: dict[str, dict] = {}
    canonical_schema_ids: dict[str, set[UUID]] = defaultdict(set)

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

            if ck not in canonical_info:
                canonical_info[ck] = {
                    "canonical_key": ck,
                    "label": field.get("analytics_label") or field.get("key", ck),
                    "field_type": field.get("type", "string"),
                    "analytics_group": field.get("analytics_group"),
                    "school_year_count": 0,
                    "document_types": [],
                }

            canonical_schema_ids[ck].add(schema.id)

    # Phase 2: load all SchoolYearRequirements to build the reverse mapping
    # from schema → document_type and schema → school_year.
    all_syrs = (await db.execute(select(SchoolYearRequirement))).scalars().all()

    schema_to_doc_types: dict[str, set[UUID]] = defaultdict(set)
    schema_to_sy_ids: dict[str, set[UUID]] = defaultdict(set)
    for syr in all_syrs:
        sid = str(syr.extraction_schema_id)
        if syr.extraction_schema_id:
            if syr.document_type_id:
                schema_to_doc_types[sid].add(syr.document_type_id)
            if syr.school_year_id:
                schema_to_sy_ids[sid].add(syr.school_year_id)

    # Resolve document_type IDs to human-readable names.
    all_doc_type_ids = {
        dt_id
        for doc_sets in schema_to_doc_types.values()
        for dt_id in doc_sets
        if dt_id
    }

    doc_type_names: dict[str, str] = {}
    if all_doc_type_ids:
        dt_result = await db.execute(
            select(DocumentType).where(DocumentType.id.in_(all_doc_type_ids))
        )
        for dt in dt_result.scalars().all():
            doc_type_names[str(dt.id)] = dt.name

    # Phase 3: compose the final response.
    result = []
    for ck, info in canonical_info.items():
        all_dt_names: set[str] = set()
        all_sy_ids: set[UUID] = set()
        for schema_id in canonical_schema_ids[ck]:
            sid = str(schema_id)
            for dt_id in schema_to_doc_types.get(sid, set()):
                name = doc_type_names.get(str(dt_id))
                if name:
                    all_dt_names.add(name)
            all_sy_ids.update(schema_to_sy_ids.get(sid, set()))

        info["school_year_count"] = len(all_sy_ids)
        info["document_types"] = sorted(all_dt_names)
        result.append(info)

    return sorted(result, key=lambda x: x["canonical_key"])
