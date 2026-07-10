from __future__ import annotations

from collections import defaultdict
from uuid import UUID

from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from ...models import (
    DocumentSubmission,
    ExtractionSchema,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from .aggregators import AGGREGATORS, infer_mode
from .field_values import extract_values


async def get_trends(
    db: SessionDep,
    keys: list[str],
    from_year: int,
    to_year: int,
    department_id: UUID | None = None,
) -> dict:
    all_schemas = (
        await db.execute(select(ExtractionSchema))
    ).scalars().all()

    key_fields: dict[str, list[dict]] = defaultdict(list)
    for schema in all_schemas:
        fields = schema.fields_json or []
        for field in fields:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue
            ck = field.get("canonical_key") or field.get("key")
            if ck not in keys:
                continue
            key_fields[ck].append({**field, "schema_id": schema.id})

    school_years = (
        await db.execute(
            select(SchoolYear)
            .where(
                extract("year", SchoolYear.start_date).between(from_year, to_year)
            )
            .order_by(SchoolYear.start_date)
        )
    ).scalars().all()

    school_year_list = [
        {"school_year_id": str(sy.id), "school_year_name": sy.name}
        for sy in school_years
    ]

    schema_to_sy: dict[str, list[UUID]] = defaultdict(list)
    for sy in school_years:
        syrs = (
            await db.execute(
                select(SchoolYearRequirement).where(
                    SchoolYearRequirement.school_year_id == sy.id,
                    SchoolYearRequirement.extraction_schema_id.isnot(None),
                )
            )
        ).scalars().all()
        for syr in syrs:
            schema_to_sy[str(syr.extraction_schema_id)].append(sy.id)

    student_where_extra = [Student.program_id == department_id] if department_id else []

    canonical_keys_result: dict = {}

    for ck in keys:
        if ck not in key_fields:
            canonical_keys_result[ck] = {
                "label": ck,
                "field_type": "string",
                "analytics_mode": "distribution",
                "series": [None] * len(school_year_list),
            }
            continue

        field_entries = key_fields[ck]
        first = field_entries[0]
        field_type: str = first.get("type", "string")
        mode: str = first.get("analytics_mode") or infer_mode(field_type)
        label: str = first.get("analytics_label") or first.get("label") or ck

        series: list = []

        for sy in school_years:
            sy_submissions: list = []
            for fe in field_entries:
                schema_id = fe["schema_id"]
                if str(schema_id) not in schema_to_sy:
                    continue
                if sy.id not in schema_to_sy[str(schema_id)]:
                    continue
                field_key = fe.get("key", "")
                ft = fe.get("type", "string")
                student_where = [Student.school_year_id == sy.id, *student_where_extra]
                subs = (
                    await db.execute(
                        select(DocumentSubmission).where(
                            DocumentSubmission.student_id.in_(
                                select(Student.id).where(*student_where)
                            ),
                            DocumentSubmission.status == SubmissionStatus.VERIFIED,
                            DocumentSubmission.extracted_data.isnot(None),
                        )
                    )
                ).scalars().all()
                sy_submissions.extend(subs)

            if not sy_submissions:
                series.append(None)
                continue

            values: list = []
            for fe in field_entries:
                field_id = fe.get("id") or fe.get("key", "")
                ft = fe.get("type", "string")
                values.extend(extract_values(sy_submissions, field_id, ft, fe.get("key", "")))

            aggregator = AGGREGATORS.get(mode)
            if not aggregator:
                series.append(None)
                continue

            agg_result = aggregator.aggregate(values)
            entry: dict = {
                "school_year_id": str(sy.id),
                "school_year_name": sy.name,
            }
            entry.update(agg_result)
            series.append(entry)

        canonical_keys_result[ck] = {
            "label": label,
            "field_type": field_type,
            "analytics_mode": mode,
            "series": series,
        }

    return {
        "school_years": school_year_list,
        "canonical_keys": canonical_keys_result,
    }
