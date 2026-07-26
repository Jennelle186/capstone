from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, date, timezone

from sqlalchemy import desc, func, select

from ..database import SessionDep
from ..models import (
    Adviser,
    Department,
    DocumentSubmission,
    SchoolYear,
    Student,
    SubmissionStatus,
    User,
)
from .adviser_core import get_department_ids_for_adviser
from .helpers import compute_initials, exclude_replaced_submissions, get_active_school_year_id
from .requirements import get_bulk_student_slot_statuses, get_student_slot_statuses


async def get_analytics(
    db: SessionDep,
    adviser: Adviser,
) -> dict:
    """Return live dashboard stats for an adviser's assigned departments.

    Metrics are scoped to the **active** school year and filtered through
    the adviser's ``ProgramAdviserAssignment`` records.

    Returns counts for: total students, pending reviews (submitted/in-review
    status), submissions uploaded today, verified documents, and an overall
    progress percentage (verified / total non-pending submissions).
    """
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

    sub_query = exclude_replaced_submissions(
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

    pending_reviews = sum(
        1 for r in all_subs
        if r.status in (SubmissionStatus.SUBMITTED, SubmissionStatus.IN_REVIEW)
    )
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


async def get_archived(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str,
) -> dict | None:
    """Return detailed archived analytics for a specific school year.

    Unlike ``get_analytics`` (which only returns live aggregates), this
    function returns per-student breakdowns, monthly submission timelines,
    status distributions, and per-student completion status derived from
    verified-doc counts vs. required-doc counts by classification.

    Returns ``None`` if the school year ID is not a valid UUID or does not
    exist.  Returns zeroed data if the adviser has no assigned departments
    for the given school year.
    """
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

    sub_query = exclude_replaced_submissions(
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

    statuses_map = await get_bulk_student_slot_statuses(db, students)

    student_statuses: dict[str, int] = defaultdict(int)
    student_responses: list[dict] = []
    for s in students:
        u = user_map.get(s.user_id)
        classification_val = s.classification.value if s.classification else None

        slot_statuses = statuses_map.get(s.id, [])
        slots_total = len(slot_statuses)
        slots_complete = sum(1 for sl in slot_statuses if sl.is_complete)
        completion_pct = min(100, round(slots_complete / slots_total * 100)) if slots_total > 0 else 0

        if slots_total > 0 and slots_complete == slots_total:
            student_statuses["Complete"] += 1
        elif slots_complete > 0:
            student_statuses["In Progress"] += 1
        else:
            student_statuses["Not Started"] += 1

        student_responses.append({
            "id": str(s.id),
            "name": f"{u.first_name or ''} {u.last_name or ''}".strip() if u else "Unknown",
            "initials": compute_initials(u.first_name if u else None, u.last_name if u else None),
            "student_number": s.student_number,
            "email": u.email if u else None,
            "program": dept_map.get(s.program_id),
            "school_year": school_year.name,
            "classification": classification_val,
            "documents_submitted": slots_complete,
            "documents_total": slots_total,
            "completion_pct": completion_pct,
            "created_at": s.created_at.isoformat() if s.created_at else "",
        })

    student_status_items = [
        {"status": st, "count": ct}
        for st, ct in sorted(student_statuses.items(), key=lambda x: -x[1])
    ]
    complete_count = student_statuses.get("Complete", 0)
    student_completion_rate = min(100, round(complete_count / total_students * 100)) if total_students > 0 else 0

    return {
        "analytics": {
            "school_year": school_year.name,
            "total_students": total_students,
            "total_submissions": total_submissions,
            "verification_rate": verification_rate,
            "avg_processing_days": avg_days,
            "status_distribution": status_dist_items,
            "monthly_submissions": monthly_submissions,
            "student_status_distribution": student_status_items,
            "student_completion_rate": student_completion_rate,
        },
        "students": student_responses,
    }
