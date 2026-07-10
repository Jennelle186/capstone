from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
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


async def get_extraction_analytics(
    db: SessionDep,
    school_year_id: UUID,
    department_id: UUID | None = None,
) -> dict:
    school_year = await db.get(SchoolYear, school_year_id)
    if not school_year:
        raise ValueError(f"School year {school_year_id} not found")

    syrs = (
        await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
    ).scalars().all()

    schema_ids = [syr.extraction_schema_id for syr in syrs if syr.extraction_schema_id]

    schemas = (
        (await db.execute(
            select(ExtractionSchema).where(ExtractionSchema.id.in_(schema_ids))
        )).scalars().all()
    ) if schema_ids else []

    doc_type_ids = list({syr.document_type_id for syr in syrs})

    student_where = [Student.school_year_id == school_year_id]
    if department_id:
        student_where.append(Student.program_id == department_id)

    students_result = await db.execute(
        select(Student).where(*student_where)
    )
    all_students = students_result.scalars().all()
    total_students = len(all_students)

    submissions = (
        await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.student_id.in_(
                    select(Student.id).where(*student_where)
                ),
                DocumentSubmission.document_type_id.in_(doc_type_ids),
                DocumentSubmission.status == SubmissionStatus.VERIFIED,
                DocumentSubmission.extracted_data.isnot(None),
            )
        )
    ).scalars().all()

    fields: list[dict] = []

    for schema in schemas:
        schema_fields = schema.fields_json or []
        for field in schema_fields:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue

            field_key: str = field.get("key", "")
            field_id: str = field.get("id") or field_key
            field_type: str = field.get("type", "string")
            mode: str = field.get("analytics_mode") or infer_mode(field_type)

            values = extract_values(submissions, field_id, field_type, field_key)
            aggregator = AGGREGATORS.get(mode)
            if not aggregator:
                continue

            agg_result = aggregator.aggregate(values)

            values_present = len(values)
            values_missing = total_students - values_present
            completion_rate = (
                round(values_present / total_students * 100, 1)
                if total_students
                else 0.0
            )

            canonical_key = field.get("canonical_key") or field_key
            label = field.get("analytics_label") or field.get("label") or canonical_key
            analytics_group = field.get("analytics_group")

            entry: dict = {
                "canonical_key": canonical_key,
                "key": field_key,
                "label": label,
                "field_type": field_type,
                "analytics_mode": mode,
                "analytics_group": analytics_group,
                "insights": {
                    "total_students": total_students,
                    "values_present": values_present,
                    "values_missing": values_missing,
                    "completion_rate": completion_rate,
                },
            }
            entry.update(agg_result)
            fields.append(entry)

    fields.sort(key=lambda f: (f.get("analytics_group") or "", f["canonical_key"]))

    return {
        "school_year_id": str(school_year_id),
        "school_year_name": school_year.name,
        "total_students": total_students,
        "total_verified_submissions": len(submissions),
        "fields": fields,
    }
