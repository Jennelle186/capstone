"""
Student-facing requirement slot endpoint.

Returns active requirement slots alongside their real-time dynamically
computed completion statuses using the inventory-based resolution engine.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from ...database import SessionDep
from ...models import SchoolYear, Student, StudentClassification
from ...schemas.requirements import RequiredSlotsResponse
from ...services.requirements import get_student_slot_statuses
from ...services.user_sync import ensure_user_row
from ..documents.schemas import StudentClaims

router = APIRouter(tags=["students"])


class ClassificationUpdateRequest(BaseModel):
    classification: str


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


@router.patch("/api/me/classification")
async def update_student_classification(
    body: ClassificationUpdateRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()

    if student is None:
        raise HTTPException(404, "Student profile not found.")

    if student.classification_set_by_user or (
        student.classification is not None and student.classification != StudentClassification.FRESHMAN
    ):
        raise HTTPException(
            status_code=409,
            detail="Classification has already been set and cannot be changed. Contact your adviser if you need to make changes.",
        )

    try:
        classification_value = StudentClassification(body.classification)
    except ValueError:
        raise HTTPException(400, f"Invalid classification: {body.classification}")

    student.classification = classification_value
    student.classification_set_by_user = True
    await db.commit()
    return {"classification": student.classification.value}
