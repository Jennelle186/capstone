from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, date, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.orm import attributes, selectinload

from ..database import SessionDep
from ..models import (
    Adviser,
    Department,
    DocumentSubmission,
    DocumentType,
    DocumentTypeStatus,
    ExtractionSchema,
    ExtractionSchemaStatus,
    ProgramAdviserAssignment,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
    User,
)
from ..routers.admin.program_assignment import (
    get_active_school_year_id,
    get_program_id_to_department_code_map,
)
from ..services.document_requirements import get_required_document_types_for_student
from ..services.gcp_storage import generate_presigned_url as gcs_generate_presigned_url


# ─── Pure helpers ────────────────────────────────────────────────────────────

def compute_initials(first_name: str | None, last_name: str | None) -> str:
    f = (first_name or "")[:1]
    l = (last_name or "")[:1]
    return (f + l).upper() or "?"


def relative_time(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "Just now"
    if seconds < 3600:
        m = seconds // 60
        return f"{m}m ago"
    if seconds < 86400:
        h = seconds // 3600
        return f"{h}h ago"
    if seconds < 604800:
        d = seconds // 86400
        return f"{d}d ago"
    return dt.strftime("%b %d")


# ─── DB helpers ──────────────────────────────────────────────────────────────

async def resolve_adviser(db: SessionDep, current_user: dict) -> Adviser | None:
    user_id = current_user.get("sub")
    if not user_id:
        return None
    user_result = await db.execute(select(User).where(User.clerk_user_id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None
    adviser_result = await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    return adviser_result.scalar_one_or_none()


async def get_school_year_id(
    db: SessionDep,
    school_year_id_str: str | None,
) -> uuid.UUID | None:
    if school_year_id_str is not None:
        try:
            return uuid.UUID(school_year_id_str)
        except ValueError:
            return None
    return await get_active_school_year_id(db)


async def get_department_ids_for_adviser(
    db: SessionDep,
    adviser: Adviser,
    target_school_year_id: uuid.UUID,
) -> list[uuid.UUID]:
    assignment_stmt = (
        select(ProgramAdviserAssignment)
        .where(
            ProgramAdviserAssignment.adviser_id == adviser.id,
            ProgramAdviserAssignment.school_year_id == target_school_year_id,
        )
        .order_by(desc(ProgramAdviserAssignment.updated_at))
    )
    assignments = (await db.execute(assignment_stmt)).scalars().all()
    if not assignments:
        return []

    program_id_to_code = await get_program_id_to_department_code_map(db)
    dept_codes = [
        program_id_to_code.get(a.program_id)
        for a in assignments
    ]
    dept_codes = [c for c in dept_codes if c is not None]
    if not dept_codes:
        return []

    dept_result = await db.execute(
        select(Department).where(func.lower(Department.code).in_([c.lower() for c in dept_codes]))
    )
    departments = dept_result.scalars().all()
    return [d.id for d in departments]


async def get_required_doc_counts_by_class(
    db: SessionDep,
    school_year_id: uuid.UUID,
) -> dict[str | None, int]:
    stmt = (
        select(DocumentType.id, DocumentType.applicable_classifications)
        .join(SchoolYearRequirement, SchoolYearRequirement.document_type_id == DocumentType.id)
        .where(
            SchoolYearRequirement.school_year_id == school_year_id,
            DocumentType.status == DocumentTypeStatus.ACTIVE,
        )
    )
    rows = (await db.execute(stmt)).all()

    all_classifications: set[str | None] = {
        "freshman", "transferee", "shifter", "returning", "cross_enrollee", None
    }
    counts: dict[str | None, int] = defaultdict(int)
    for dt_id, applicable in rows:
        applicable_set = set(applicable or [])
        for cls in all_classifications:
            if not applicable_set or cls in applicable_set:
                counts[cls] += 1
    return dict(counts)


# ─── Business logic: submissions ─────────────────────────────────────────────

async def list_submissions(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str | None,
) -> list[dict]:
    target_school_year_id = await get_school_year_id(db, school_year_id_str)
    if target_school_year_id is None:
        return []

    dept_ids = await get_department_ids_for_adviser(db, adviser, target_school_year_id)
    if not dept_ids:
        return []

    stmt = (
        select(
            DocumentSubmission.id,
            DocumentSubmission.created_at,
            DocumentSubmission.status,
            DocumentSubmission.extracted_data,
            User.first_name,
            User.last_name,
            Student.id.label("student_id"),
            Student.student_number,
            DocumentType.name.label("document_type_name"),
        )
        .select_from(DocumentSubmission)
        .join(Student, DocumentSubmission.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .outerjoin(DocumentType, DocumentSubmission.document_type_id == DocumentType.id)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == target_school_year_id,
            DocumentSubmission.status == SubmissionStatus.SUBMITTED,
        )
        .order_by(desc(DocumentSubmission.created_at))
    )
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": str(row.id),
            "student_id": str(row.student_id) if row.student_id else "",
            "student_name": f"{row.first_name} {row.last_name}".strip(),
            "student_number": row.student_number,
            "initials": compute_initials(row.first_name, row.last_name),
            "document_type_name": row.document_type_name,
            "status": row.status.value if hasattr(row.status, "value") else str(row.status),
            "created_at": relative_time(row.created_at),
            "extraction_fields": row.extracted_data or {},
        }
        for row in rows
    ]


async def get_submission_download_url(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
) -> str | None:
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    if submission.status not in (
        SubmissionStatus.UPLOADED,
        SubmissionStatus.FLAGGED,
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.PROCESSING,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
    ):
        return None

    return gcs_generate_presigned_url(submission.file_key)


async def get_submission_extractions(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
) -> dict | None:
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    if not submission.document_type_id:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    req_result = await db.execute(
        select(SchoolYearRequirement)
        .where(
            SchoolYearRequirement.school_year_id == student.school_year_id,
            SchoolYearRequirement.document_type_id == submission.document_type_id,
            SchoolYearRequirement.extraction_schema_id.isnot(None),
        )
    )
    req = req_result.scalar_one_or_none()

    if req is None or req.extraction_schema_id is None:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    schema = await db.get(ExtractionSchema, req.extraction_schema_id)
    if schema is None or schema.status == ExtractionSchemaStatus.ARCHIVED:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    extracted = submission.extracted_data or {}
    if not isinstance(extracted, dict):
        extracted = {}

    fields: list[dict] = []
    for field_def in (schema.fields_json or []):
        field_id = field_def.get("id", "")
        existing = extracted.get(field_id, {})
        if isinstance(existing, str):
            value = existing
            needs_review = False
            confidence = 1.0
        elif isinstance(existing, dict):
            value = str(existing.get("value", "") or "")
            needs_review = existing.get("needs_review", True)
            confidence = existing.get("confidence", 0.0)
        else:
            continue

        fields.append({
            "id": field_id,
            "key": field_def.get("key", ""),
            "type": field_def.get("type", "string"),
            "description": field_def.get("description", ""),
            "required": field_def.get("required", False),
            "value": value,
            "confidence": confidence,
            "needs_review": needs_review,
            "ui_component": field_def.get("ui_component"),
            "options": field_def.get("options"),
            "section_title": field_def.get("section_title"),
        })

    return {
        "submission_id": str(submission.id),
        "classification_result": submission.classification_result,
        "fields": fields,
    }


async def save_submission_extraction_field(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
    field_id: str,
    value: str,
) -> dict | None:
    """Save a single extracted field value for a document submission.

    Stores the field value in `extracted_data` JSONB, keyed by field_id.
    Also sets `needs_review` to False once the adviser has touched the field.
    """
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    extracted = submission.extracted_data or {}
    if not isinstance(extracted, dict):
        extracted = {}

    extracted[field_id] = {
        "value": value,
        "needs_review": False,
        "confidence": 1.0,
        "source_key": "adviser_manual",
    }

    submission.extracted_data = extracted
    attributes.flag_modified(submission, "extracted_data")
    await db.commit()
    await db.refresh(submission)

    return {
        "field_id": field_id,
        "value": value,
        "needs_review": False,
        "confidence": 1.0,
    }


# ─── Business logic: school years ────────────────────────────────────────────

async def list_school_years(
    db: SessionDep,
    adviser: Adviser,
) -> list[dict]:
    assignment_stmt = (
        select(ProgramAdviserAssignment.school_year_id)
        .where(ProgramAdviserAssignment.adviser_id == adviser.id)
        .distinct()
    )
    assigned_year_ids = (await db.execute(assignment_stmt)).scalars().all()
    if not assigned_year_ids:
        return []

    stmt = (
        select(SchoolYear)
        .where(SchoolYear.id.in_(assigned_year_ids))
        .order_by(desc(SchoolYear.start_date))
    )
    years = (await db.execute(stmt)).scalars().all()

    return [
        {
            "id": str(y.id),
            "name": y.name,
            "is_current": y.is_active,
        }
        for y in years
    ]


# ─── Business logic: students ────────────────────────────────────────────────

async def list_students(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str | None,
) -> list[dict]:
    target_sy_id = await get_school_year_id(db, school_year_id_str)
    if target_sy_id is None:
        return []

    dept_ids = await get_department_ids_for_adviser(db, adviser, target_sy_id)
    if not dept_ids:
        return []

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
        select(User.id, User.first_name, User.last_name, User.email)
        .where(User.id.in_([s.user_id for s in students]))
    )
    user_rows = (await db.execute(user_stmt)).all()
    user_map = {row.id: row for row in user_rows}

    school_year = await db.get(SchoolYear, target_sy_id)

    dept_stmt = select(Department.id, Department.name).where(Department.id.in_(dept_ids))
    dept_rows = (await db.execute(dept_stmt)).all()
    dept_map = {row.id: row.name for row in dept_rows}

    sub_count_stmt = (
        select(
            DocumentSubmission.student_id,
            func.count(DocumentSubmission.id),
        )
        .where(
            DocumentSubmission.student_id.in_(student_ids),
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
        .group_by(DocumentSubmission.student_id)
    )
    sub_counts = {
        row.student_id: row[1]
        for row in (await db.execute(sub_count_stmt)).all()
    }

    req_counts = await get_required_doc_counts_by_class(db, target_sy_id)

    result: list[dict] = []
    for s in students:
        u = user_map.get(s.user_id)
        first = u.first_name if u else None
        last = u.last_name if u else None
        email = u.email if u else None

        classification_val = s.classification.value if s.classification else None
        submitted = sub_counts.get(s.id, 0)
        total = req_counts.get(classification_val, 0) or req_counts.get(None, 0)
        if total == 0:
            completion_pct = 0
        else:
            completion_pct = min(100, round(submitted / total * 100))

        result.append({
            "id": str(s.id),
            "name": f"{first or ''} {last or ''}".strip() or "Unknown",
            "initials": compute_initials(first, last),
            "student_number": s.student_number,
            "email": email,
            "program": dept_map.get(s.program_id) if s.program_id else None,
            "school_year": school_year.name if school_year else None,
            "classification": classification_val,
            "documents_submitted": submitted,
            "documents_total": total,
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

    await db.refresh(student, ["user"])
    school_year = await db.get(SchoolYear, student.school_year_id)
    u = student.user
    first = u.first_name if u else None
    last = u.last_name if u else None
    email = u.email if u else None

    dept = student.program_department
    program_name = dept.name if dept else None

    classification_val = student.classification.value if student.classification else None

    req_types = await get_required_document_types_for_student(db, student)
    documents_total = len(req_types)

    sub_stmt = (
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
        .order_by(desc(DocumentSubmission.created_at))
    )
    submissions = (await db.execute(sub_stmt)).scalars().all()
    documents_submitted = len(submissions)
    completion_pct = min(100, round(documents_submitted / documents_total * 100)) if documents_total > 0 else 0

    sub_responses = [
        {
            "id": str(sub.id),
            "document_type": sub.document_type.name if sub.document_type else None,
            "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            "submitted_at": sub.created_at.isoformat() if sub.created_at else "",
            "extraction_fields": sub.extracted_data or {},
            "classification_result": sub.classification_result,
        }
        for sub in submissions
    ]

    return {
        "id": str(student.id),
        "name": f"{first or ''} {last or ''}".strip() or "Unknown",
        "initials": compute_initials(first, last),
        "student_number": student.student_number,
        "email": email,
        "program": program_name,
        "school_year": school_year.name if school_year else None,
        "classification": classification_val,
        "documents_submitted": documents_submitted,
        "documents_total": documents_total,
        "completion_pct": completion_pct,
        "created_at": student.created_at.isoformat() if student.created_at else "",
        "submissions": sub_responses,
    }


# ─── Business logic: analytics ───────────────────────────────────────────────

async def get_analytics(
    db: SessionDep,
    adviser: Adviser,
) -> dict:
    target_sy_id = await get_active_school_year_id(db)
    if target_sy_id is None:
        return {
            "totalStudents": 0,
            "pendingReviews": 0,
            "submittedToday": 0,
            "verifiedCount": 0,
            "progressPercent": 0,
        }

    dept_ids = await get_department_ids_for_adviser(db, adviser, target_sy_id)
    if not dept_ids:
        return {
            "totalStudents": 0,
            "pendingReviews": 0,
            "submittedToday": 0,
            "verifiedCount": 0,
            "progressPercent": 0,
        }

    student_count_stmt = select(func.count(Student.id)).where(
        Student.program_id.in_(dept_ids),
        Student.school_year_id == target_sy_id,
    )
    total_students = (await db.execute(student_count_stmt)).scalar() or 0

    sub_query = (
        select(DocumentSubmission.id, DocumentSubmission.status, DocumentSubmission.created_at)
        .select_from(DocumentSubmission)
        .join(Student, DocumentSubmission.student_id == Student.id)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == target_sy_id,
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
    )
    all_subs = (await db.execute(sub_query)).all()

    pending_reviews = sum(1 for r in all_subs if r.status == SubmissionStatus.SUBMITTED)
    verified_count = sum(1 for r in all_subs if r.status == SubmissionStatus.VERIFIED)

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    submitted_today = sum(
        1 for r in all_subs
        if r.created_at and r.created_at >= today_start
    )

    total_subs = len(all_subs)
    progress_percent = min(100, round(verified_count / total_subs * 100)) if total_subs > 0 else 0

    return {
        "totalStudents": total_students,
        "pendingReviews": pending_reviews,
        "submittedToday": submitted_today,
        "verifiedCount": verified_count,
        "progressPercent": progress_percent,
    }


# ─── Business logic: archived ────────────────────────────────────────────────

async def get_archived(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str,
) -> dict | None:
    try:
        sy_id = uuid.UUID(school_year_id_str)
    except ValueError:
        return None

    school_year = await db.get(SchoolYear, sy_id)
    if school_year is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, sy_id)
    if not dept_ids:
        return {
            "analytics": {
                "school_year": school_year.name,
                "total_students": 0,
                "total_submissions": 0,
                "verification_rate": 0,
                "avg_processing_days": None,
                "status_distribution": [],
                "monthly_submissions": [],
            },
            "students": [],
        }

    student_count_stmt = select(func.count(Student.id)).where(
        Student.program_id.in_(dept_ids),
        Student.school_year_id == sy_id,
    )
    total_students = (await db.execute(student_count_stmt)).scalar() or 0

    sub_query = (
        select(
            DocumentSubmission.id,
            DocumentSubmission.status,
            DocumentSubmission.created_at,
            DocumentSubmission.updated_at,
            DocumentSubmission.student_id,
        )
        .select_from(DocumentSubmission)
        .join(Student, DocumentSubmission.student_id == Student.id)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == sy_id,
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
    )
    all_subs = (await db.execute(sub_query)).all()

    total_submissions = len(all_subs)

    status_distribution: dict[str, int] = defaultdict(int)
    verified_days: list[float] = []
    monthly: dict[str, int] = defaultdict(int)

    for r in all_subs:
        status_val = r.status.value if hasattr(r.status, "value") else str(r.status)
        status_distribution[status_val] += 1

        if r.created_at:
            month_key = r.created_at.strftime("%b")
            monthly[month_key] += 1

        if r.status == SubmissionStatus.VERIFIED and r.created_at and r.updated_at:
            diff = (r.updated_at - r.created_at).total_seconds() / 86400
            if diff >= 0:
                verified_days.append(diff)

    verified_count = status_distribution.get("verified", 0)
    verification_rate = min(100, round(verified_count / total_submissions * 100)) if total_submissions > 0 else 0
    avg_days = round(sum(verified_days) / len(verified_days), 1) if verified_days else None

    month_order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly_submissions = [
        {"month": m, "count": monthly.get(m, 0)}
        for m in month_order if monthly.get(m, 0) > 0
    ]

    status_dist_items = [
        {"status": st, "count": ct}
        for st, ct in sorted(status_distribution.items(), key=lambda x: -x[1])
    ]

    students_stmt = (
        select(Student)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == sy_id,
        )
        .order_by(Student.created_at.desc())
    )
    students = (await db.execute(students_stmt)).scalars().all()

    user_ids = [s.user_id for s in students]
    user_stmt = select(User.id, User.first_name, User.last_name, User.email).where(User.id.in_(user_ids))
    user_rows = (await db.execute(user_stmt)).all()
    user_map = {r.id: r for r in user_rows}

    dept_stmt = select(Department.id, Department.name).where(Department.id.in_(dept_ids))
    dept_rows = (await db.execute(dept_stmt)).all()
    dept_map = {r.id: r.name for r in dept_rows}

    sub_count_stmt = (
        select(DocumentSubmission.student_id, func.count(DocumentSubmission.id))
        .where(
            DocumentSubmission.student_id.in_([s.id for s in students]),
            DocumentSubmission.status != SubmissionStatus.PENDING,
        )
        .group_by(DocumentSubmission.student_id)
    )
    sub_counts = {r.student_id: r[1] for r in (await db.execute(sub_count_stmt)).all()}

    req_counts = await get_required_doc_counts_by_class(db, sy_id)

    student_responses: list[dict] = []
    for s in students:
        u = user_map.get(s.user_id)
        classification_val = s.classification.value if s.classification else None
        submitted = sub_counts.get(s.id, 0)
        total = req_counts.get(classification_val, 0) or req_counts.get(None, 0)
        completion_pct = min(100, round(submitted / total * 100)) if total > 0 else 0

        student_responses.append({
            "id": str(s.id),
            "name": f"{u.first_name or ''} {u.last_name or ''}".strip() if u else "Unknown",
            "initials": compute_initials(u.first_name if u else None, u.last_name if u else None),
            "student_number": s.student_number,
            "email": u.email if u else None,
            "program": dept_map.get(s.program_id),
            "school_year": school_year.name,
            "classification": classification_val,
            "documents_submitted": submitted,
            "documents_total": total,
            "completion_pct": completion_pct,
            "created_at": s.created_at.isoformat() if s.created_at else "",
        })

    return {
        "analytics": {
            "school_year": school_year.name,
            "total_students": total_students,
            "total_submissions": total_submissions,
            "verification_rate": verification_rate,
            "avg_processing_days": avg_days,
            "status_distribution": status_dist_items,
            "monthly_submissions": monthly_submissions,
        },
        "students": student_responses,
    }
