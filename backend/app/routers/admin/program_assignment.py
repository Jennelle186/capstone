from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import desc, func, select

from ...database import SessionDep
from ...models import Department, ProgramAdviserAssignment, SchoolYear
from ...services.helpers import (
    get_active_school_year_id,
    get_program_id_to_department_code_map,
    program_uuid_for_department_code,
)

# The get_adviser_department_map function retrieves a mapping of adviser IDs to their assigned department codes for a given list of adviser IDs. It first checks if the list of adviser IDs is empty and returns an empty dictionary if so. Then, it retrieves the active school year ID and the program ID to department code mapping. It queries the ProgramAdviserAssignment table for assignments that match the active school year and the provided adviser IDs, ordered by the most recently updated. Finally, it constructs a dictionary mapping each adviser ID to their corresponding department code based on their program assignment, ensuring that only the most recent assignment is considered for each adviser.
async def get_adviser_department_map(db: SessionDep, adviser_ids: Sequence[UUID]) -> dict[UUID, str]:
    if not adviser_ids:
        return {}

    active_school_year_id = await get_active_school_year_id(db)
    if active_school_year_id is None:
        return {}

    program_id_to_code = await get_program_id_to_department_code_map(db)
    if not program_id_to_code:
        return {}

    stmt = (
        select(
            ProgramAdviserAssignment.adviser_id,
            ProgramAdviserAssignment.program_id,
        )
        .where(
            ProgramAdviserAssignment.school_year_id == active_school_year_id,
            ProgramAdviserAssignment.adviser_id.in_(adviser_ids),
        )
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    rows = (await db.execute(stmt)).all()

    adviser_department_map: dict[UUID, str] = {}
    for adviser_id, program_id in rows:
        if adviser_id in adviser_department_map:
            continue
        department_code = program_id_to_code.get(program_id)
        if department_code:
            adviser_department_map[adviser_id] = department_code

    return adviser_department_map

# The get_adviser_department_map_for_school_year function is similar to get_adviser_department_map 
# but allows for specifying a particular school year ID instead of using the active school year. 
# It retrieves the adviser to department code mapping for the given adviser IDs and specified school year, 
# following the same logic as the previous function but scoped to the provided school year.
async def get_adviser_department_map_for_school_year(
    db: SessionDep,
    adviser_ids: Sequence[UUID],
    school_year_id: UUID | None,
) -> dict[UUID, str]:
    if not adviser_ids or school_year_id is None:
        return {}

    program_id_to_code = await get_program_id_to_department_code_map(db)
    if not program_id_to_code:
        return {}

    stmt = (
        select(
            ProgramAdviserAssignment.adviser_id,
            ProgramAdviserAssignment.program_id,
        )
        .where(
            ProgramAdviserAssignment.school_year_id == school_year_id,
            ProgramAdviserAssignment.adviser_id.in_(adviser_ids),
        )
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    rows = (await db.execute(stmt)).all()

    adviser_department_map: dict[UUID, str] = {}
    for adviser_id, program_id in rows:
        if adviser_id in adviser_department_map:
            continue
        department_code = program_id_to_code.get(program_id)
        if department_code:
            adviser_department_map[adviser_id] = department_code

    return adviser_department_map

# The get_department_adviser_counts function retrieves a count of advisers assigned to each department for the active school year. 
# It first retrieves the active school year ID and the program ID to department code mapping. 
# Then, it queries the ProgramAdviserAssignment table to count the number of adviser assignments for each program ID in the active school year, grouping the results by program ID. 
# Finally, it constructs a dictionary mapping each department code (in lowercase) to the total count of advisers assigned to that department, summing counts for programs that belong to the same department.
async def get_department_adviser_counts(db: SessionDep) -> dict[str, int]:
    active_school_year_id = await get_active_school_year_id(db)
    if active_school_year_id is None:
        return {}

    program_id_to_code = await get_program_id_to_department_code_map(db)
    if not program_id_to_code:
        return {}

    stmt = (
        select(
            ProgramAdviserAssignment.program_id,
            func.count(ProgramAdviserAssignment.id),
        )
        .where(ProgramAdviserAssignment.school_year_id == active_school_year_id)
        .group_by(ProgramAdviserAssignment.program_id)
    )
    rows = (await db.execute(stmt)).all()

    department_counts: dict[str, int] = {}
    for program_id, count in rows:
        department_code = program_id_to_code.get(program_id)
        if not department_code:
            continue
        key = department_code.lower()
        department_counts[key] = department_counts.get(key, 0) + count

    return department_counts


async def get_department_adviser_counts_for_school_year(
    db: SessionDep,
    school_year_id: UUID | None,
) -> dict[str, int]:
    if school_year_id is None:
        return {}

    program_id_to_code = await get_program_id_to_department_code_map(db)
    if not program_id_to_code:
        return {}

    stmt = (
        select(
            ProgramAdviserAssignment.program_id,
            func.count(ProgramAdviserAssignment.id),
        )
        .where(ProgramAdviserAssignment.school_year_id == school_year_id)
        .group_by(ProgramAdviserAssignment.program_id)
    )
    rows = (await db.execute(stmt)).all()

    department_counts: dict[str, int] = {}
    for program_id, count in rows:
        department_code = program_id_to_code.get(program_id)
        if not department_code:
            continue
        key = department_code.lower()
        department_counts[key] = department_counts.get(key, 0) + count

    return department_counts
