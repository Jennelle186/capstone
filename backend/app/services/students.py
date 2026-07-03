from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict

from sqlalchemy import desc, func, select

logger = logging.getLogger(__name__)
from sqlalchemy.orm import selectinload

from ..database import SessionDep
from ..models import (
    Adviser,
    Department,
    DocumentSubmission,
    DocumentType,
    DocumentTypeStatus,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
    User,
)
from .adviser_core import get_department_ids_for_adviser, get_school_year_id
from .clerk import fetch_user_profile
from .document_requirements import get_required_document_types_for_student
from .helpers import compute_initials, exclude_replaced_submissions


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
        select(User.id, User.first_name, User.last_name, User.email, User.image_url, User.clerk_user_id)
        .where(User.id.in_([s.user_id for s in students]))
    )
    user_rows = (await db.execute(user_stmt)).all()
    user_map = {row.id: row for row in user_rows}

    missing_image = [
        (row.id, row.clerk_user_id) for row in user_rows
        if not row.image_url and row.clerk_user_id
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

    sub_count_stmt = exclude_replaced_submissions(
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
            "image_url": u.image_url if u else None,
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
            "rejection_reason": sub.rejection_reason,
        }
        for sub in submissions
    ]

    return {
        "id": str(student.id),
        "name": f"{first or ''} {last or ''}".strip() or "Unknown",
        "initials": compute_initials(first, last),
        "student_number": student.student_number,
        "email": email,
        "image_url": u.image_url if u else None,
        "program": program_name,
        "school_year": school_year.name if school_year else None,
        "classification": classification_val,
        "documents_submitted": documents_submitted,
        "documents_total": documents_total,
        "completion_pct": completion_pct,
        "created_at": student.created_at.isoformat() if student.created_at else "",
        "submissions": sub_responses,
    }
