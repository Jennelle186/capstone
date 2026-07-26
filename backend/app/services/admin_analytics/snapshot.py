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
from ...services.requirements import get_bulk_student_slot_statuses
from .aggregators import AGGREGATORS, infer_mode, snake_to_title
from .field_values import extract_values


async def get_extraction_analytics(
    db: SessionDep,
    school_year_id: UUID,
    department_id: UUID | None = None,
    department_ids: list[UUID] | None = None,
) -> dict:
    """Build a snapshot of extraction-field analytics for a given school year.

    For each analytics-enabled field across all extraction schemas linked to
    the school year, aggregate the extracted values from verified submissions
    and compute distribution / numeric / boolean summaries.

    When a *snapshot* (``snapshot_fields_json``) exists on a
    |SchoolYearRequirement| it is used instead of the live schema definition.
    This lets admins freeze the field set at the start of the year so that
    mid-year schema changes don't retroactively alter historical analytics.
    """
    school_year = await db.get(SchoolYear, school_year_id)
    if not school_year:
        raise ValueError(f"School year {school_year_id} not found")

    # Load SYRs that have an extraction schema attached (these define which
    # fields are collected for this school year).
    syrs = (
        await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
    ).scalars().all()

    # Also load SYRs without schema (document-type mappings for compliance).
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

    # Scope to department(s) when provided, otherwise all students in the SY.
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

    # Load only verified submissions that have extracted_data — these are the
    # records whose field values we aggregate.
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

    # Build a lookup: schema_id → snapshot_fields_json (or None if no snapshot).
    # When a snapshot exists it takes priority over the live schema definition.
    schema_snapshots: dict[UUID, list | None] = {}
    for syr in syrs:
        sid = syr.extraction_schema_id
        if sid and sid not in schema_snapshots:
            schema_snapshots[sid] = syr.snapshot_fields_json

    for schema in schemas:
        snap = schema_snapshots.get(schema.id)
        # Use the frozen snapshot if available, otherwise fall back to the
        # live schema.fields_json.
        schema_fields = list(snap if snap is not None else (schema.fields_json or []))

        # When a frozen snapshot exists, overlay analytics-metadata properties
        # from the live schema so that mode / bucket / canonical-key changes
        # take effect immediately without requiring a snapshot refresh.
        if snap is not None:
            live_by_key: dict[str, dict] = {}
            for f in (schema.fields_json or []):
                if isinstance(f, dict) and f.get("key"):
                    live_by_key[f["key"]] = f
            for f in schema_fields:
                if not isinstance(f, dict):
                    continue
                fk = f.get("key")
                if not fk or fk not in live_by_key:
                    continue
                live = live_by_key[fk]
                for prop in (
                    "is_analytics", "analytics_mode", "analytics_group",
                    "analytics_label", "canonical_key", "buckets",
                    "is_computed", "computation",
                ):
                    if prop in live:
                        f[prop] = live[prop]

        for field in schema_fields:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue

            field_key: str = field.get("key", "")
            field_id: str = field.get("id") or field_key
            field_type: str = field.get("type", "string")
            mode: str = field.get("analytics_mode") or infer_mode(field_type)

            # Extract raw values for this field from all verified submissions,
            # then delegate to the appropriate aggregator.
            values = extract_values(submissions, field_id, field_type, field_key)

            # ── Per-submission compute fallback ─
            # For each submission that did NOT contribute a stored value,
            # try to compute one on-the-fly from its existing dependency data.
            # This fills gaps when some (but not all) submissions lack a
            # pre-stored computed value (e.g. after a schema change or when
            # the computed field was added mid-year).
            if field.get("is_computed"):
                comp = field.get("computation") or {}
                op = comp.get("operation")
                dep_ids = comp.get("dependencies", [])
                if op and dep_ids:
                    # Map each field id → key so the dependency resolver can
                    # fall back to a source_key scan when the direct field-id
                    # lookup misses (submissions extracted with an older schema
                    # that used different UUIDs).
                    dep_id_to_key: dict[str, str] = {}
                    for f in schema_fields:
                        if isinstance(f, dict) and f.get("id"):
                            dep_id_to_key[f["id"]] = f.get("key", "")

                    for sub in submissions:
                        ed = sub.extracted_data or {}

                        # Skip submissions that already contributed a stored
                        # value via extract_values above.
                        entry = ed.get(field_id)
                        if entry is None and field_key:
                            entry = ed.get(field_key)
                        if entry is None and field_key:
                            for _v in ed.values():
                                if isinstance(_v, dict) and _v.get("source_key") == field_key:
                                    entry = _v
                                    break
                        if entry is not None:
                            continue

                        # Resolve dependency values using the same 3-step
                        # lookup: direct id → source_key scan.
                        deps: list[float] = []
                        for did in dep_ids:
                            d = ed.get(did, {})
                            if not isinstance(d, dict) or d.get("value") is None:
                                dep_key = dep_id_to_key.get(did, "")
                                if dep_key:
                                    for _v in ed.values():
                                        if isinstance(_v, dict) and _v.get("source_key") == dep_key:
                                            d = _v
                                            break
                            v = (d.get("value") if isinstance(d, dict) else None)
                            if v is not None and v != "":
                                try:
                                    deps.append(float(v))
                                except (ValueError, TypeError):
                                    pass
                        if deps:
                            if op == "average":
                                values.append(round(sum(deps) / len(deps), 2))
                            elif op == "sum":
                                values.append(round(sum(deps), 2))
                            elif op == "max":
                                values.append(round(max(deps), 2))
                            elif op == "min":
                                values.append(round(min(deps), 2))
                        # If deps is empty the submission is silently skipped —
                        # it simply has no computable data.

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

    # Sort fields by group first, then by canonical key within groups.
    fields.sort(key=lambda f: (f.get("analytics_group") or "", f["canonical_key"]))

    # ── Slot Compliance ──
    # Per-slot completion: for each requirement slot, count how many
    # eligible students have satisfied it.  Completion is determined by
    # ``get_student_slot_statuses`` which handles classification filtering
    # and matched-counts-against-min_required.

    statuses_map = await get_bulk_student_slot_statuses(db, all_students)

    compliance_map: dict[str, dict] = {}
    for s in all_students:
        slot_statuses = statuses_map.get(s.id, [])
        for st in slot_statuses:
            slot_id = str(st.id)
            if slot_id not in compliance_map:
                compliance_map[slot_id] = {
                    "display_name": st.group_name or st.description or (
                        st.items[0].document_type_name if st.items else "Untitled slot"),
                    "eligible": 0,
                    "completed": 0,
                    "classifications": set(),
                }
            compliance_map[slot_id]["eligible"] += 1
            if s.classification and s.classification.value:
                compliance_map[slot_id]["classifications"].add(s.classification.value)
            if st.is_complete:
                compliance_map[slot_id]["completed"] += 1

    compliance_items: list[dict] = []
    for slot_id, info in compliance_map.items():
        eligible = info["eligible"]
        completed = info["completed"]
        if eligible == 0:
            continue
        rate = round(completed / eligible * 100, 1)
        compliance_items.append({
            "document_type": info["display_name"],
            "document_code": "",
            "classification_scope": sorted(info["classifications"]),
            "verified": completed,
            "pending": 0,
            "missing": eligible - completed,
            "eligible_students": eligible,
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
