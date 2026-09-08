from __future__ import annotations

import logging
from collections import defaultdict
from uuid import UUID

from sqlalchemy import select

from ...database import SessionDep
from ...models import (
    AnalyticsDimension,
    DocumentType,
    ExtractionSchema,
    SchoolYearRequirement,
)

logger = logging.getLogger(__name__)


async def get_canonical_keys(db: SessionDep) -> list[dict]:
    """Return canonical analytics keys from the registry.

    The ``analytics_dimensions`` table is the single source of truth for each
    key's label, field type, and group which is going to be used in analytics. This function still scans extraction
    schemas to compute usage metrics (``school_year_count`` and ``document_types``), but only for keys that are registered. 
    Analytics-enabled schema fields whose canonical key is not registered are skipped and logged.

    Returns a list sorted alphabetically by canonical key.
    """

    # load active registry rows. These supply all metadata.
    dimensions = (
        await db.execute(
            select(AnalyticsDimension).where(
                AnalyticsDimension.is_active == True  # noqa: E712
            )
        )
    ).scalars().all()

    registry_by_key: dict[str, AnalyticsDimension] = {
        dim.canonical_key.lower(): dim for dim in dimensions
    }

    # scan schemas only to collect which keys are actually used.
    schemas = (await db.execute(select(ExtractionSchema))).scalars().all()

    canonical_schema_ids: dict[str, set[UUID]] = defaultdict(set)
    unregistered_keys: set[str] = set()

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

            if ck.lower() not in registry_by_key:
                unregistered_keys.add(ck)
                continue

            canonical_schema_ids[ck.lower()].add(schema.id)

    for ck in sorted(unregistered_keys):
        logger.warning(
            "Analytics field %r has no registry entry; add it via "
            "/api/admin/analytics-dimensions or remove is_analytics from the schema.",
            ck,
        )

    # load all SchoolYearRequirements to build the reverse mapping
    # from schema -> document_type and schema -> school_year.
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

    # this is the final response from registry metadata + usage metrics.
    result = []
    for dim in dimensions:
        all_dt_names: set[str] = set()
        all_sy_ids: set[UUID] = set()
        for schema_id in canonical_schema_ids.get(dim.canonical_key.lower(), set()):
            sid = str(schema_id)
            for dt_id in schema_to_doc_types.get(sid, set()):
                name = doc_type_names.get(str(dt_id))
                if name:
                    all_dt_names.add(name)
            all_sy_ids.update(schema_to_sy_ids.get(sid, set()))

        result.append(
            {
                "id": str(dim.id),
                "canonical_key": dim.canonical_key,
                "label": dim.label,
                "field_type": dim.field_type,
                "analytics_group": dim.analytics_group,
                "school_year_count": len(all_sy_ids),
                "document_types": sorted(all_dt_names),
                "is_active": dim.is_active,
            }
        )

    return sorted(result, key=lambda x: x["canonical_key"])
