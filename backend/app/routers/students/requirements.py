"""
Student-facing requirement slot endpoint.

Returns active requirement slots alongside their real-time dynamically
computed completion statuses using the inventory-based resolution engine.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ...database import SessionDep
from ...models import SchoolYear, Student
from ...schemas.requirements import RequiredSlotsResponse
from ...services.requirements import get_student_slot_statuses
from ...services.user_sync import ensure_user_row
from ..documents.schemas import StudentClaims

router = APIRouter(tags=["students"])


@router.get("/api/me/required-slots", response_model=RequiredSlotsResponse)
async def get_required_slots(
    current_user: StudentClaims,
    db: SessionDep,
) -> RequiredSlotsResponse:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()

    if student is None or student.school_year_id is None:
        return RequiredSlotsResponse(
            school_year_id=None,
            school_year_name=None,
            classification=student.classification.value if student and student.classification else None,
            slots=[],
        )

    school_year = await db.get(SchoolYear, student.school_year_id)
    slot_statuses = await get_student_slot_statuses(db, student)

    return RequiredSlotsResponse(
        school_year_id=str(student.school_year_id),
        school_year_name=school_year.name if school_year else None,
        classification=student.classification.value if student.classification else None,
        slots=slot_statuses,
    )
