from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from ...models import (
    DocumentSubmission,
    DocumentType,
    ExtractionSchema,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from .aggregators import AGGREGATORS, infer_mode, snake_to_title
from .field_values import extract_values


async def get_extraction_analytics(
    db: SessionDep,
    school_year_id: UUID,
    department_id: UUID | None = None,
    department_ids: list[UUID] | None = None,
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

    all_syrs = (
        await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == school_year_id,
            )
        )
    ).scalars().all()

    schema_ids = [syr.extraction_schema_id for syr in syrs if syr.extraction_schema_id]

    schemas = (
        (await db.execute(
            select(ExtractionSchema).where(ExtractionSchema.id.in_(schema_ids))
        )).scalars().all()
    ) if schema_ids else []

    doc_type_ids = list({syr.document_type_id for syr in all_syrs})

    student_where = [Student.school_year_id == school_year_id]
    if department_ids:
        student_where.append(Student.program_id.in_(department_ids))
    elif department_id:
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

    schema_snapshots: dict[UUID, list | None] = {}
    for syr in syrs:
        sid = syr.extraction_schema_id
        if sid and sid not in schema_snapshots:
            schema_snapshots[sid] = syr.snapshot_fields_json

    for schema in schemas:
        snap = schema_snapshots.get(schema.id)
        schema_fields = snap if snap is not None else (schema.fields_json or [])
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

            values_present = len(values)
            values_missing = total_students - values_present
            completion_rate = (
                round(values_present / total_students * 100, 1)
                if total_students
                else 0.0
            )

            canonical_key = field.get("canonical_key") or field_key
            label = field.get("analytics_label") or field.get("label") or snake_to_title(canonical_key)
            analytics_group = field.get("analytics_group")

            field_options = field.get("options")
            buckets_config = field.get("buckets")
            agg_result = aggregator.aggregate(values, options=field_options, buckets=buckets_config)

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

    # --- Document Compliance ---
    doc_types_result = await db.execute(
        select(DocumentType).where(DocumentType.id.in_(doc_type_ids))
    )
    doc_types = {dt.id: dt for dt in doc_types_result.scalars().all()}

    compliance_items: list[dict] = []
    for doc_type_id in doc_type_ids:
        dt = doc_types.get(doc_type_id)
        if not dt:
            continue

        applicable = dt.applicable_classifications or []
        if applicable:
            eligible_students = [
                s for s in all_students if s.classification in applicable
            ]
        else:
            eligible_students = all_students
        eligible_count = len(eligible_students)
        if not eligible_count:
            continue

        eligible_ids = [s.id for s in eligible_students]

        latest_sub = (
            select(
                DocumentSubmission.student_id,
                DocumentSubmission.document_type_id,
                DocumentSubmission.status,
                func.row_number().over(
                    partition_by=(
                        DocumentSubmission.student_id,
                        DocumentSubmission.document_type_id,
                    ),
                    order_by=DocumentSubmission.updated_at.desc(),
                ).label("rn"),
            ).where(
                DocumentSubmission.student_id.in_(eligible_ids),
                DocumentSubmission.document_type_id == doc_type_id,
            )
        ).subquery()

        counts = (
            await db.execute(
                select(
                    latest_sub.c.status,
                    func.count(latest_sub.c.student_id).label("cnt"),
                ).where(latest_sub.c.rn == 1)
                .group_by(latest_sub.c.status)
            )
        ).all()

        status_counts: dict = {SubmissionStatus.VERIFIED: 0, SubmissionStatus.PENDING: 0}
        for row in counts:
            status_counts[row.status] = row.cnt

        verified = status_counts[SubmissionStatus.VERIFIED]
        pending = status_counts[SubmissionStatus.PENDING]
        missing = eligible_count - verified - pending
        rate = round(verified / eligible_count * 100, 1) if eligible_count else 0.0

        compliance_items.append({
            "document_type": dt.name,
            "document_code": dt.code or "",
            "classification_scope": applicable,
            "verified": verified,
            "pending": pending,
            "missing": missing,
            "eligible_students": eligible_count,
            "verification_rate": rate,
        })

    return {
        "school_year_id": str(school_year_id),
        "school_year_name": school_year.name,
        "total_students": total_students,
        "total_verified_submissions": len(submissions),
        "fields": fields,
        "document_compliance": compliance_items,
    }
