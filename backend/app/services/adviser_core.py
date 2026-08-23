from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select

from ..database import SessionDep
from ..models import Adviser, Department, Program, ProgramAdviserAssignment, User
from .helpers import (
    get_active_school_year_id,
    get_program_id_to_department_code_map,
    program_uuid_for_department_code,
)


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


async def list_adviser_departments(
    db: SessionDep,
    adviser: Adviser,
    target_school_year_id: uuid.UUID,
) -> list[dict]:
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
    return [
        {"id": str(d.id), "name": d.name, "code": d.code}
        for d in departments
    ]


async def reconcile_adviser_program_assignments(
    db: SessionDep,
    adviser_id: uuid.UUID,
    school_year_id: uuid.UUID,
    department_codes: list[str],
) -> list[str]:
    """Reconcile an adviser's program assignments to match the given department codes.

    Diff-based (not pure-additive): rows for codes in ``department_codes`` that
    are missing are created, and existing rows whose code is absent from the
    list are deleted. Pass an empty list to remove every assignment for the
    adviser in the given school year. ``Program`` rows are auto-created for any
    code that has no corresponding Program row yet.

    Returns the list of department codes that ended up assigned after the
    reconcile (useful for building the response payload).
    """
    assignment_stmt = (
        select(ProgramAdviserAssignment)
        .where(
            ProgramAdviserAssignment.adviser_id == adviser_id,
            ProgramAdviserAssignment.school_year_id == school_year_id,
        )
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    existing_assignments = (await db.execute(assignment_stmt)).scalars().all()

    desired_codes = {code.strip().upper() for code in department_codes if code.strip()}
    desired_program_ids = {
        program_uuid_for_department_code(code) for code in desired_codes
    }

    # Delete existing assignments whose program is no longer in the desired set.
    for assignment in existing_assignments:
        if assignment.program_id not in desired_program_ids:
            await db.delete(assignment)

    # Add missing assignments for desired programs that have no row yet.
    existing_program_ids = {a.program_id for a in existing_assignments}
    for code in desired_codes:
        program_id = program_uuid_for_department_code(code)
        if program_id in existing_program_ids:
            continue
        program = await db.get(Program, program_id)
        if program is None:
            db.add(Program(id=program_id))
        db.add(
            ProgramAdviserAssignment(
                adviser_id=adviser_id,
                program_id=program_id,
                school_year_id=school_year_id,
            )
        )

    await db.flush()

    # Preserve the caller's ordering rather than sorting alphabetically so that
    # callers relying on the first code as the "primary" department keep stable
    # semantics after a reconcile.
    seen: set[str] = set()
    ordered: list[str] = []
    for code in department_codes:
        normalized = (code or "").strip().upper()
        if normalized and normalized not in seen:
            seen.add(normalized)
            ordered.append(normalized)
    return ordered
