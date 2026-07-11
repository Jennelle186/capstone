from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from ...database import SessionDep
from ...models import Adviser, Department, DocumentSubmission, ProgramAdviserAssignment, SchoolYear, Student, SubmissionStatus, User
from ..helpers import exclude_replaced_submissions, get_active_school_year_id, program_uuid_for_department_code
from ..students import get_required_doc_counts_by_class


async def get_dashboard_kpi(db: SessionDep) -> dict:
    """Build admin dashboard KPI payload — submission totals, pending queue
    size, and per-department clearance rates for the active school year.

    A student is considered *cleared* when every document type required for
    their classification has been verified (verified count >= required count).
    """
    active_sy_id = await get_active_school_year_id(db)
    if active_sy_id is None:
        return {
            "school_year": "",
            "total_submissions": 0,
            "weekly_new_submissions": 0,
            "pending_queue": 0,
            "pending_queue_weekly_delta": 0,
            "department_clearance": [],
        }

    school_year = await db.get(SchoolYear, active_sy_id)
    school_year_name = school_year.name if school_year else ""

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # ── Adviser info per department (for the department efficiency card) ──
    dept_stmt = select(Department.id, Department.code, Department.name)
    dept_rows = (await db.execute(dept_stmt)).all()
    dept_map = {r.id: r.name for r in dept_rows}

    dept_code_to_id = {r.code.lower(): r.id for r in dept_rows}
    prog_id_to_dept_id: dict[uuid.UUID, uuid.UUID] = {
        program_uuid_for_department_code(code): dept_id
        for code, dept_id in dept_code_to_id.items()
    }

    adviser_stmt = (
        select(
            ProgramAdviserAssignment.program_id,
            User.first_name,
            User.last_name,
        )
        .join(Adviser, ProgramAdviserAssignment.adviser_id == Adviser.id)
        .join(User, Adviser.user_id == User.id)
        .where(ProgramAdviserAssignment.school_year_id == active_sy_id)
    )
    adviser_rows = (await db.execute(adviser_stmt)).all()

    dept_adviser_names: dict[uuid.UUID, list[str]] = defaultdict(list)
    for pid, first_name, last_name in adviser_rows:
        dept_id = prog_id_to_dept_id.get(pid)
        if dept_id is not None:
            name = f"{first_name or ''} {last_name or ''}".strip()
            if name:
                dept_adviser_names[dept_id].append(name)

    # ── Total submissions (exclude replaced) ──
    total_sub_stmt = exclude_replaced_submissions(
        select(func.count(DocumentSubmission.id))
    )
    total_submissions = (await db.execute(total_sub_stmt)).scalar() or 0

    # ── Weekly new submissions ──
    weekly_stmt = exclude_replaced_submissions(
        select(func.count(DocumentSubmission.id))
        .where(DocumentSubmission.created_at >= seven_days_ago)
    )
    weekly_new = (await db.execute(weekly_stmt)).scalar() or 0

    # ── Pending queue: non-replaced, not verified ──
    pending_stmt = exclude_replaced_submissions(
        select(func.count(DocumentSubmission.id))
        .where(DocumentSubmission.status != SubmissionStatus.VERIFIED)
    )
    pending_queue = (await db.execute(pending_stmt)).scalar() or 0

    # ── Pending queue 7 days ago (for delta) ──
    # Positive delta means more documents are waiting than a week ago
    # (throughput isn't keeping up).  Negative means the queue is shrinking.
    pending_before_stmt = exclude_replaced_submissions(
        select(func.count(DocumentSubmission.id))
        .where(
            DocumentSubmission.status != SubmissionStatus.VERIFIED,
            DocumentSubmission.created_at < seven_days_ago,
        )
    )
    pending_queue_before = (await db.execute(pending_before_stmt)).scalar() or 0
    pending_queue_weekly_delta = pending_queue - pending_queue_before

    # ── Clearance by department ──
    # A student is "cleared" when every document type required for their
    # classification has been verified.  We roll that up per department
    # so admins can spot departments that are falling behind.
    #
    # Steps:
    #   1. Look up how many document types each classification needs
    #   2. Count VERIFIED submissions per student
    #   3. Per student: cleared if verified >= required
    #   4. Aggregate counts by (student.program_id → department name)
    students_stmt = (
        select(Student)
        .where(Student.school_year_id == active_sy_id)
    )
    students = (await db.execute(students_stmt)).scalars().all()

    if not students:
        return {
            "school_year": school_year_name,
            "total_submissions": total_submissions,
            "weekly_new_submissions": weekly_new,
            "pending_queue": pending_queue,
            "pending_queue_weekly_delta": pending_queue_weekly_delta,
            "department_clearance": [],
        }

    student_ids = [s.id for s in students]

    verified_count_stmt = exclude_replaced_submissions(
        select(DocumentSubmission.student_id, func.count(DocumentSubmission.id))
        .where(
            DocumentSubmission.student_id.in_(student_ids),
            DocumentSubmission.status == SubmissionStatus.VERIFIED,
        )
        .group_by(DocumentSubmission.student_id)
    )
    verified_counts = {r.student_id: r[1] for r in (await db.execute(verified_count_stmt)).all()}

    req_counts = await get_required_doc_counts_by_class(db, active_sy_id)

    dept_student_counts: dict[uuid.UUID, int] = defaultdict(int)
    dept_cleared_counts: dict[uuid.UUID, int] = defaultdict(int)

    for s in students:
        dept_id = s.program_id
        if dept_id is None:
            continue
        dept_student_counts[dept_id] += 1

        classification_val = s.classification.value if s.classification else None
        verified = verified_counts.get(s.id, 0)
        total_required = req_counts.get(classification_val, 0) or req_counts.get(None, 0)

        # A student is cleared when the number of verified submissions
        # meets or exceeds the number of document types required for
        # their classification level.
        if total_required > 0 and verified >= total_required:
            dept_cleared_counts[dept_id] += 1

    department_clearance = [
        {
            "department_id": str(dept_id),
            "department_name": dept_map.get(dept_id, "Unknown"),
            "total_students": dept_student_counts[dept_id],
            "cleared_students": dept_cleared_counts.get(dept_id, 0),
            "clearance_rate": (
                min(100, round(dept_cleared_counts.get(dept_id, 0) / dept_student_counts[dept_id] * 100))
                if dept_student_counts[dept_id] > 0
                else 0
            ),
            "adviser_count": len(dept_adviser_names.get(dept_id, [])),
            "adviser_names": dept_adviser_names.get(dept_id, []),
        }
        for dept_id in dept_student_counts
    ]
    # Sort lowest rate first so the most bottlenecked department
    # appears at the top of the front-end table.
    department_clearance.sort(key=lambda d: d["clearance_rate"])

    return {
        "school_year": school_year_name,
        "total_submissions": total_submissions,
        "weekly_new_submissions": weekly_new,
        "pending_queue": pending_queue,
        "pending_queue_weekly_delta": pending_queue_weekly_delta,
        "department_clearance": department_clearance,
    }
