from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from ..database import SessionDep
from ..models import SchoolYear, SchoolYearStatus


async def get_school_year_or_404(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await db.get(SchoolYear, school_year_id)
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    return school_year


async def ensure_school_year_requirements_mutable(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await get_school_year_or_404(db, school_year_id)
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed school years cannot be modified.",
        )
    return school_year
