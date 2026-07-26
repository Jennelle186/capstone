from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ...database import SessionDep
from ...rbac import require_admin
from ...schemas.requirements import (
    SlotAssignmentRequest,
    SlotAssignmentResponse,
    SlotResponse,
)
from ...services.requirements import (
    list_requirement_slots,
    replace_requirement_slots,
)

router = APIRouter()


@router.get("/requirement-slots", response_model=list[SlotResponse])
async def get_requirement_slots(
    school_year_id: UUID = Query(...),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await list_requirement_slots(db, school_year_id)


@router.put("/requirement-slots", response_model=SlotAssignmentResponse)
async def save_requirement_slots(
    payload: SlotAssignmentRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    slots_data = [slot.model_dump() for slot in payload.slots]
    created = await replace_requirement_slots(db, payload.school_year_id, slots_data)
    return SlotAssignmentResponse(
        school_year_id=payload.school_year_id,
        slots=await list_requirement_slots(db, payload.school_year_id),
    )
