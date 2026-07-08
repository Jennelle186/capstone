from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from ...database import SessionDep
from ...models import (
    Department,
    DocumentSubmission,
    DocumentType,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
    User,
    UserRole,
)
from ...rbac import require_admin
from ...services.helpers import exclude_replaced_submissions

router = APIRouter(prefix="/students")


class AdminStudentResponse(BaseModel):
    id: str
    name: str
    student_number: str
    email: str
    image_url: str
    department_code: str
    department_name: str
    classification: str
    document_status: str
    documents_submitted: int
    documents_total: int


class DepartmentSummaryResponse(BaseModel):
    code: str
    name: str
    enrolled_count: int
    completed_count: int


class StudentsPageResponse(BaseModel):
    students: list[AdminStudentResponse]
    department_summaries: list[DepartmentSummaryResponse]


def _build_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    return " ".join(parts).strip() or "Unknown"


def _compute_document_status(
    submitted: int,
    total: int,
    has_review: bool,
) -> str:
    if total == 0:
        return "not_submitted"
    if has_review:
        return "pending_review"
    if submitted >= total:
        return "complete"
    if submitted > 0:
        return "incomplete"
    return "not_submitted"


@router.get("", response_model=StudentsPageResponse)
async def list_students(
    school_year_id: str | None = Query(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    if not school_year_id:
        return StudentsPageResponse(students=[], department_summaries=[])

    try:
        sy_uuid = uuid.UUID(school_year_id)
    except ValueError:
        return StudentsPageResponse(students=[], department_summaries=[])

    # Fetch students for this school year, filtering to only actual students (role=student)
    student_stmt = (
        select(Student)
        .join(User, Student.user_id == User.id)
        .where(
            Student.school_year_id == sy_uuid,
            User.role == UserRole.STUDENT,
        )
        .order_by(Student.created_at.desc())
    )
    students = (await db.execute(student_stmt)).scalars().all()
    if not students:
        return StudentsPageResponse(students=[], department_summaries=[])

    # Map user info
    user_ids = list({s.user_id for s in students})
    user_stmt = select(User).where(User.id.in_(user_ids))
    user_rows = (await db.execute(user_stmt)).scalars().all()
    user_map = {u.id: u for u in user_rows}

    # Map department info
    dept_ids = list({s.program_id for s in students if s.program_id})
    dept_stmt = select(Department).where(Department.id.in_(dept_ids))
    dept_rows = (await db.execute(dept_stmt)).scalars().all()
    dept_map = {d.id: d for d in dept_rows}

    # Submission counts per student (exclude replaced submissions)
    student_ids = [s.id for s in students]
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
    sub_counts_raw = (await db.execute(sub_count_stmt)).all()
    sub_counts: dict[uuid.UUID, int] = {row.student_id: row[1] for row in sub_counts_raw}

    # Check for in-review submissions per student
    review_stmt = exclude_replaced_submissions(
        select(DocumentSubmission.student_id)
        .where(
            DocumentSubmission.student_id.in_(student_ids),
            DocumentSubmission.status == SubmissionStatus.IN_REVIEW,
        )
    )
    review_rows = (await db.execute(review_stmt)).all()
    review_student_ids: set[uuid.UUID] = {row.student_id for row in review_rows}

    # Required document counts by classification
    req_stmt = (
        select(DocumentType.applicable_classifications)
        .join(
            SchoolYearRequirement,
            SchoolYearRequirement.document_type_id == DocumentType.id,
        )
        .where(SchoolYearRequirement.school_year_id == sy_uuid)
    )
    req_rows = (await db.execute(req_stmt)).scalars().all()
    all_classifications: list[str | None] = [
        "freshman", "transferee", "shifter", "returning", "cross_enrollee", None,
    ]
    req_counts: dict[str | None, int] = defaultdict(int)
    for applicable in req_rows:
        applicable_set = set(applicable or [])
        for cls in all_classifications:
            if not applicable_set or cls in applicable_set:
                req_counts[cls] += 1

    # Track per-department completion
    dept_enrolled: dict[uuid.UUID | None, int] = defaultdict(int)
    dept_completed: dict[uuid.UUID | None, int] = defaultdict(int)

    student_responses: list[AdminStudentResponse] = []
    for s in students:
        user = user_map.get(s.user_id)
        if user is None:
            continue

        dept = dept_map.get(s.program_id) if s.program_id else None
        classification_val = s.classification.value if s.classification else None
        submitted = sub_counts.get(s.id, 0)
        total = req_counts.get(classification_val, 0) or req_counts.get(None, 0)
        has_review = s.id in review_student_ids

        status = _compute_document_status(submitted, total, has_review)

        student_responses.append(
            AdminStudentResponse(
                id=str(s.id),
                name=_build_name(user),
                student_number=s.student_number or "",
                email=user.email or "",
                image_url=user.image_url or "",
                department_code=dept.code if dept else "",
                department_name=dept.name if dept else "",
                classification=classification_val or "",
                document_status=status,
                documents_submitted=submitted,
                documents_total=total,
            )
        )

        dept_id = s.program_id
        dept_enrolled[dept_id] += 1
        if status == "complete":
            dept_completed[dept_id] += 1

    # Build department summaries for all departments
    all_depts = (
        await db.execute(
            select(Department).order_by(Department.name)
        )
    ).scalars().all()

    department_summaries: list[DepartmentSummaryResponse] = []
    for dept in all_depts:
        enrolled = dept_enrolled.get(dept.id, 0)
        completed = dept_completed.get(dept.id, 0)
        department_summaries.append(
            DepartmentSummaryResponse(
                code=dept.code,
                name=dept.name,
                enrolled_count=enrolled,
                completed_count=completed,
            )
        )

    return StudentsPageResponse(
        students=student_responses,
        department_summaries=department_summaries,
    )
