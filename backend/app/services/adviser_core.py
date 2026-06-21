from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select

from ..database import SessionDep
from ..models import Adviser, Department, ProgramAdviserAssignment, User
from .helpers import get_active_school_year_id, get_program_id_to_department_code_map


async def resolve_adviser(db: SessionDep, current_user: dict) -> Adviser | None:
    user_id = current_user.get("sub")
    if not user_id:
        return None
    user_result = await db.execute(select(User).where(User.clerk_user_id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None
    adviser_result = await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    return adviser_result.scalar_one_or_none()


async def get_school_year_id(
    db: SessionDep,
    school_year_id_str: str | None,
) -> uuid.UUID | None:
    if school_year_id_str is not None:
        try:
            return uuid.UUID(school_year_id_str)
        except ValueError:
            return None
    return await get_active_school_year_id(db)


async def get_department_ids_for_adviser(
    db: SessionDep,
    adviser: Adviser,
    target_school_year_id: uuid.UUID,
) -> list[uuid.UUID]:
    assignment_stmt = (
        select(ProgramAdviserAssignment)
        .where(
            ProgramAdviserAssignment.adviser_id == adviser.id,
            ProgramAdviserAssignment.school_year_id == target_school_year_id,
        )
        .order_by(desc(ProgramAdviserAssignment.updated_at))
    )
    assignments = (await db.execute(assignment_stmt)).scalars().all()
    if not assignments:
        return []

    program_id_to_code = await get_program_id_to_department_code_map(db)
    dept_codes = [
        program_id_to_code.get(a.program_id)
        for a in assignments
    ]
    dept_codes = [c for c in dept_codes if c is not None]
    if not dept_codes:
        return []

    dept_result = await db.execute(
        select(Department).where(func.lower(Department.code).in_([c.lower() for c in dept_codes]))
    )
    departments = dept_result.scalars().all()
    return [d.id for d in departments]
