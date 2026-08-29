from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date

from sqlalchemy import desc, func, or_, select

logger = logging.getLogger(__name__)
from sqlalchemy.orm import selectinload

from ..database import SessionDep
from ..models import (
    Adviser,
    Department,
    DocumentSubmission,
    ExtractionSchema,
    RequirementSlot,
    RequirementSlotItem,
    SchoolYear,
    Student,
    SubmissionStatus,
    User,
)
from .adviser_core import get_department_ids_for_adviser, get_school_year_id
from .clerk import fetch_user_profile
from .helpers import compute_initials, exclude_replaced_submissions
from .requirements import get_bulk_student_slot_statuses, get_student_slot_statuses

_ANALYTICS_KEYWORDS: dict[str, list[str]] = {
    "gpa": ["gpa", "gwa", "grade point", "general weighted"],
    "cet_score": ["cet", "college entrance", "admission test", "entrance exam"],
    "high_school": ["high school", "secondary school", "graduating school"],
    "provincial_address": ["provincial", "home address", "permanent address", "barangay", "municipality"],
    "gender": ["gender", "sex"],
}

_ANALYTICS_LABELS: dict[str, str] = {
    "gpa": "GPA",
    "cet_score": "CET Score",
    "high_school": "High School",
    "provincial_address": "Provincial Address",
    "gender": "Gender",
}


def _infer_analytics_tag(source_key: str) -> str | None:
    key_lower = source_key.lower().replace("_", " ")
    for tag, keywords in _ANALYTICS_KEYWORDS.items():
        if any(kw in key_lower for kw in keywords):
            return tag
    return None


def _compute_gpa_from_semesters(extracted_data: dict) -> str | None:
    grades = []
    for field_id, field_data in extracted_data.items():
        if not isinstance(field_data, dict):
            continue
        source_key = field_data.get("source_key", "")
        if any(kw in source_key.lower() for kw in ["semester", "term", "quarter"]):
            try:
                val = float(field_data.get("value", ""))
                if 0 <= val <= 100:
                    grades.append(val)
            except (ValueError, TypeError):
                pass
    if grades:
        return f"{sum(grades) / len(grades):.2f}"
    return None


def _sync_extracted_to_student(student: Student, extracted_data: dict) -> bool:
    if not extracted_data:
        return False
    changed = False
    for field_id, field_data in extracted_data.items():
        if field_id.startswith("_") or not isinstance(field_data, dict):
            continue
        source_key = field_data.get("source_key", "")
        value = field_data.get("value", "")
        if not value:
            continue

        if source_key in ("student_number", "student_id", "student_id_no", "id_number"):
            if not student.student_number:
                student.student_number = value
                changed = True
        elif source_key == "gender":
            if not student.gender:
                student.gender = value
                changed = True
        elif source_key in ("birth_date", "date_of_birth", "dob", "date_of_birth_mm_dd_yyyy"):
            if not student.birth_date:
                try:
                    parts = value.split("-")
                    if len(parts) == 3:
                        if source_key == "date_of_birth_mm_dd_yyyy":
                            student.birth_date = date(int(parts[2]), int(parts[0]), int(parts[1]))
                        else:
                            student.birth_date = date(int(parts[0]), int(parts[1]), int(parts[2]))
                        changed = True
                except (ValueError, IndexError):
                    pass
        elif source_key in ("address", "permanent_address", "home_address"):
            if not student.address:
                student.address = value
                changed = True
        elif source_key in ("first_name", "last_name"):
            current_name = student.admission_form_name or {}
            if isinstance(current_name, dict):
                current_name[source_key] = value
                student.admission_form_name = current_name
                changed = True
    return changed


_PROGRAM_SOURCE_KEYS = (
    "academic_program",
    "program",
    "course",
    "program_name",
    "degree_program",
)


def _extract_program_value(extracted_data: dict) -> str | None:
    """Return the first non-empty program-like value from extracted data."""
    if not extracted_data:
        return None
    for field_id, field_data in extracted_data.items():
        if field_id.startswith("_") or not isinstance(field_data, dict):
            continue
        if field_data.get("source_key", "") in _PROGRAM_SOURCE_KEYS:
            value = field_data.get("value", "")
            if value:
                return str(value).strip()
    return None


async def _resolve_department(db: SessionDep, value: str) -> Department | None:
    """Resolve an extracted program value to a Department by code or name."""
    result = await db.execute(
        select(Department).where(
            or_(
                func.lower(Department.code) == value.lower(),
                func.lower(Department.name) == value.lower(),
            )
        )
    )
    return result.scalars().first()


async def sync_program_from_extraction(
    db: SessionDep,
    student: Student,
    extracted_data: dict,
) -> bool:
    """Apply the 4-scenario program sync (A/B/C/D).

    - A (no program): auto-sync extracted program if recognized, else flag.
    - B (match): clear any stale mismatch flags.
    - C (differs): flag mismatch for student confirmation.
    - D (unrecognized): flag mismatch with the raw extracted value.

    Returns True when the student record was mutated (caller must commit).
    """
    extracted_program = _extract_program_value(extracted_data)
    if not extracted_program:
        return False

    matched_dept = await _resolve_department(db, extracted_program)

    if student.program_id is None:
        # Scenario A: no program set yet.
        if matched_dept is not None:
            student.program_id = matched_dept.id
            return True
        if not student.program_mismatch_pending or student.program_mismatch_extracted != extracted_program:
            student.program_mismatch_pending = True
            student.program_mismatch_extracted = extracted_program
            return True
        return False

    if matched_dept is not None and matched_dept.id == student.program_id:
        # Scenario B: extracted program matches current — clear stale flags.
        if student.program_mismatch_pending or student.program_mismatch_extracted:
            student.program_mismatch_pending = False
            student.program_mismatch_extracted = None
            return True
        return False

    # Scenario C (recognized but differs) or D (unrecognized).
    if not student.program_mismatch_pending or student.program_mismatch_extracted != extracted_program:
        student.program_mismatch_pending = True
        student.program_mismatch_extracted = extracted_program
        return True
    return False


async def list_students(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str | None,
    department_id: uuid.UUID | None = None,
) -> list[dict]:
    """Return students visible to the adviser for a school year.

    When ``department_id`` is provided (and the adviser is assigned to it),
    results are scoped to that single department instead of every assigned
    department.
    """
    target_sy_id = await get_school_year_id(db, school_year_id_str)
    if target_sy_id is None:
        return []

    dept_ids = await get_department_ids_for_adviser(db, adviser, target_sy_id)
    if not dept_ids:
        return []
    if department_id is not None and department_id not in dept_ids:
        return []
    if department_id is not None:
        dept_ids = [department_id]

    students_stmt = (
        select(Student)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == target_sy_id,
        )
        .order_by(Student.created_at.desc())
    )
    students = (await db.execute(students_stmt)).scalars().all()
    if not students:
        return []

    student_ids = [s.id for s in students]

    user_stmt = (
        select(User.id, User.first_name, User.last_name, User.email, User.image_url, User.clerk_user_id)
        .where(User.id.in_([s.user_id for s in students]))
    )
    user_rows = (await db.execute(user_stmt)).all()
    user_map = {row.id: row for row in user_rows}

    missing_image = [
        (row.id, row.clerk_user_id) for row in user_rows
        if not row.image_url and row.clerk_user_id
        and not row.clerk_user_id.startswith(("seed_sample_", "seed_2026_"))
    ]
    if missing_image:
        async def _fetch(uid):
            _, _, _, _, _, url = await fetch_user_profile(uid)
            return url

        ids, clerk_ids = zip(*missing_image)
        results = await asyncio.gather(*[_fetch(cid) for cid in clerk_ids])
        changed = False
        for user_id, url in zip(ids, results):
            if not url:
                continue
            user = await db.get(User, user_id)
            if user and user.image_url != url:
                user.image_url = url
                changed = True
        if changed:
            await db.commit()
            user_map.clear()
            fresh_rows = (await db.execute(user_stmt)).all()
            user_map.update({row.id: row for row in fresh_rows})

    school_year = await db.get(SchoolYear, target_sy_id)

    dept_stmt = select(Department.id, Department.name).where(Department.id.in_(dept_ids))
    dept_rows = (await db.execute(dept_stmt)).all()
    dept_map = {row.id: row.name for row in dept_rows}

    statuses_map = await get_bulk_student_slot_statuses(db, students)

    result: list[dict] = []
    for s in students:
        u = user_map.get(s.user_id)
        first = u.first_name if u else None
        last = u.last_name if u else None
        email = u.email if u else None

        classification_val = s.classification.value if s.classification else None

        slot_statuses = statuses_map.get(s.id, [])
        slots_total = len(slot_statuses)
        slots_complete = sum(1 for sl in slot_statuses if sl.is_complete)
        completion_pct = min(100, round(slots_complete / slots_total * 100)) if slots_total > 0 else 0

        result.append({
            "id": str(s.id),
            "name": f"{first or ''} {last or ''}".strip() or "Unknown",
            "initials": compute_initials(first, last),
            "student_number": s.student_number,
            "email": email,
            "image_url": u.image_url if u else None,
            "program": dept_map.get(s.program_id) if s.program_id else None,
            "school_year": school_year.name if school_year else None,
            "classification": classification_val,
            "application_status": s.application_status,
            "documents_submitted": slots_complete,
            "documents_total": slots_total,
            "completion_pct": completion_pct,
            "created_at": s.created_at.isoformat() if s.created_at else "",
        })
    return result


async def get_student_detail(
    db: SessionDep,
    adviser: Adviser,
    student_id_str: str,
) -> dict | None:
    try:
        student_uuid = uuid.UUID(student_id_str)
    except ValueError:
        return None

    student = await db.get(Student, student_uuid)
    if student is None:
        return None

    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    await db.refresh(student, ["user", "program_department"])
    school_year = await db.get(SchoolYear, student.school_year_id)
    u = student.user
    first = u.first_name if u else None
    last = u.last_name if u else None
    email = u.email if u else None

    dept = student.program_department
    program_name = dept.name if dept else None

    classification_val = student.classification.value if student.classification else None

    slot_statuses = await get_student_slot_statuses(db, student)
    slots_total = len(slot_statuses)
    slots_complete = sum(1 for sl in slot_statuses if sl.is_complete)
    documents_total = slots_total
    documents_submitted = slots_complete
    completion_pct = min(100, round(documents_submitted / documents_total * 100)) if documents_total > 0 else 0

    sub_stmt = exclude_replaced_submissions(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
        .order_by(desc(DocumentSubmission.created_at))
    )
    submissions = (await db.execute(sub_stmt)).scalars().all()

    sub_responses = [
        {
            "id": str(sub.id),
            "document_type": sub.document_type.name if sub.document_type else None,
            "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            "submitted_at": sub.created_at.isoformat() if sub.created_at else "",
            "extraction_fields": sub.extracted_data or {},
            "classification_result": sub.classification_result,
            "rejection_reason": sub.rejection_reason,
        }
        for sub in submissions
    ]

    # Build section_title lookup: {document_type_id -> {source_key -> section_title}}
    section_map: dict[uuid.UUID, dict[str, str]] = {}
    syr_stmt = select(RequirementSlotItem, ExtractionSchema).join(
        RequirementSlot, RequirementSlotItem.requirement_slot_id == RequirementSlot.id
    ).join(
        ExtractionSchema, RequirementSlotItem.extraction_schema_id == ExtractionSchema.id
    ).where(RequirementSlot.school_year_id == student.school_year_id)
    for item, schema in (await db.execute(syr_stmt)).all():
        key_to_section: dict[str, str] = {}
        for field in (schema.fields_json or []):
            if isinstance(field, dict) and field.get("key"):
                key_to_section[field["key"]] = field.get("section_title") or "General"
        if item.document_type_id:
            section_map[item.document_type_id] = key_to_section

    analytics: dict[str, dict[str, str]] = {}
    unmapped: list[dict] = []

    for sub in submissions:
        if sub.status != SubmissionStatus.VERIFIED or not sub.extracted_data:
            continue
        doc_type = sub.document_type.name if sub.document_type else "Unknown"
        fields: list[dict] = []
        doc_section_map = section_map.get(sub.document_type_id) if sub.document_type_id else None
        for field_id, field_data in sub.extracted_data.items():
            if not isinstance(field_data, dict):
                continue
            source_key = field_data.get("source_key", "")
            value = field_data.get("value")
            if not source_key or value is None:
                continue
            tag = _infer_analytics_tag(source_key)
            if tag and tag not in analytics:
                analytics[tag] = {
                    "value": str(value),
                    "label": _ANALYTICS_LABELS.get(tag, source_key),
                }
            elif not tag:
                section_title = (doc_section_map or {}).get(source_key, "General")
                fields.append({"key": source_key, "value": str(value), "section_title": section_title})
        if fields:
            unmapped.append({"document_type": doc_type, "fields": fields})

    if "gpa" not in analytics:
        for sub in submissions:
            if sub.status != SubmissionStatus.VERIFIED or not sub.extracted_data:
                continue
            computed = _compute_gpa_from_semesters(sub.extracted_data)
            if computed:
                analytics["gpa"] = {"value": computed, "label": "GPA (Computed)"}
                break

    return {
        "id": str(student.id),
        "name": f"{first or ''} {last or ''}".strip() or "Unknown",
        "initials": compute_initials(first, last),
        "student_number": student.student_number,
        "email": email,
        "image_url": u.image_url if u else None,
        "program": program_name,
        "program_id": str(student.program_id) if student.program_id else None,
        "program_mismatch_pending": bool(student.program_mismatch_pending),
        "program_mismatch_extracted": student.program_mismatch_extracted,
        "school_year": school_year.name if school_year else None,
        "classification": classification_val,
        "application_status": student.application_status,
        "documents_submitted": documents_submitted,
        "documents_total": documents_total,
        "completion_pct": completion_pct,
        "extracted_analytics": analytics,
        "unmapped_data": unmapped,
        "created_at": student.created_at.isoformat() if student.created_at else "",
        "submissions": sub_responses,
        "slots": [
            {
                "id": str(s.id),
                "name": s.group_name or s.description or (s.items[0].document_type_name if s.items else "Untitled slot"),
                "is_complete": s.is_complete,
                "min_required": s.min_required,
                "matched_count": s.matched_count,
                "matched_document_type_names": s.matched_document_type_names,
                "items": [
                    {
                        "document_type_name": item.document_type_name,
                        "is_primary": item.is_primary,
                    }
                    for item in s.items
                ],
            }
            for s in slot_statuses
        ],
    }
