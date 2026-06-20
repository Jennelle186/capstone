from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from ..database import SessionDep
from ..models import Adviser, Department, DocumentSubmission, DocumentType, ProgramAdviserAssignment, Student, SubmissionStatus, User, UserRole
from ..rbac import require_roles
from ..routers.admin.program_assignment import get_active_school_year_id, get_program_id_to_department_code_map

router = APIRouter(tags=["adviser"])


class AdviserSubmissionResponse(BaseModel):
    id: str
    student_name: str
    student_number: str | None
    initials: str
    document_type_name: str | None
    status: str
    created_at: str


def _compute_initials(first_name: str | None, last_name: str | None) -> str:
    f = (first_name or "")[:1]
    l = (last_name or "")[:1]
    return (f + l).upper() or "?"


def _relative_time(dt: datetime) -> str:
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


CurrentAdviser = Depends(require_roles(UserRole.ADVISER))


@router.get("/api/adviser/submissions", response_model=list[AdviserSubmissionResponse])
async def list_adviser_submissions(
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserSubmissionResponse]:
    _ = current_user
    user_id = current_user.get("sub")
    if not user_id:
        return []

    user_result = await db.execute(select(User).where(User.clerk_user_id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return []

    adviser_result = await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    adviser = adviser_result.scalar_one_or_none()
    if adviser is None:
        return []

    active_school_year_id = await get_active_school_year_id(db)
    if active_school_year_id is None:
        return []

    assignment_stmt = (
        select(ProgramAdviserAssignment)
        .where(
            ProgramAdviserAssignment.adviser_id == adviser.id,
            ProgramAdviserAssignment.school_year_id == active_school_year_id,
        )
        .order_by(desc(ProgramAdviserAssignment.updated_at))
    )
    assignment = (await db.execute(assignment_stmt)).scalars().first()
    if assignment is None:
        return []

    program_id_to_code = await get_program_id_to_department_code_map(db)
    dept_code = program_id_to_code.get(assignment.program_id)
    if dept_code is None:
        return []

    dept_result = await db.execute(select(Department).where(func.lower(Department.code) == dept_code.lower()))
    dept = dept_result.scalar_one_or_none()
    if dept is None:
        return []

    stmt = (
        select(
            DocumentSubmission.id,
            DocumentSubmission.created_at,
            DocumentSubmission.status,
            User.first_name,
            User.last_name,
            Student.student_number,
            DocumentType.name.label("document_type_name"),
        )
        .select_from(DocumentSubmission)
        .join(Student, DocumentSubmission.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .outerjoin(DocumentType, DocumentSubmission.document_type_id == DocumentType.id)
        .where(
            Student.program_id == dept.id,
            DocumentSubmission.status == SubmissionStatus.SUBMITTED,
        )
        .order_by(desc(DocumentSubmission.created_at))
    )
    rows = (await db.execute(stmt)).all()

    return [
        AdviserSubmissionResponse(
            id=str(row.id),
            student_name=f"{row.first_name} {row.last_name}".strip(),
            student_number=row.student_number,
            initials=_compute_initials(row.first_name, row.last_name),
            document_type_name=row.document_type_name,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            created_at=_relative_time(row.created_at),
        )
        for row in rows
    ]
