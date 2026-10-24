"""
Student-facing requirement slot endpoint.

Returns active requirement slots alongside their real-time dynamically
computed completion statuses using the inventory-based resolution engine.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ...database import SessionDep
from ...models import SchoolYear, Student
from ...schemas.requirements import BlankFormResponse, RequiredSlotsResponse
from ...services.requirements import get_blank_form_for_item, get_student_slot_statuses
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
            classification_set_by_user=bool(student.classification_set_by_user) if student else False,
            slots=[],
        )

    school_year = await db.get(SchoolYear, student.school_year_id)
    slot_statuses = await get_student_slot_statuses(db, student)

    return RequiredSlotsResponse(
        school_year_id=str(student.school_year_id),
        school_year_name=school_year.name if school_year else None,
        classification=student.classification.value if student.classification else None,
        classification_set_by_user=bool(student.classification_set_by_user),
        slots=slot_statuses,
    )


@router.get("/api/me/requirement-items/{item_id}/form", response_model=BlankFormResponse)
async def get_blank_form(
    item_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> BlankFormResponse:
    """Return the blank form bound to a requirement item in the student's school
    year, for printing (4A). No schema fallback and no latest-form guessing."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()

    if student is None or student.school_year_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No blank form is bound to this requirement.",
        )

    form = await get_blank_form_for_item(db, student, item_id)
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No blank form is bound to this requirement.",
        )

    return BlankFormResponse(
        form_id=form.id,
        form_name=form.name,
        document_json=form.document_json,
    )
