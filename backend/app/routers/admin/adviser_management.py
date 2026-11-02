from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, desc, func, select

from ...database import SessionDep
from ...models import (
    Adviser,
    Department,
    Program,
    ProgramAdviserAssignment,
    SchoolYear,
    SchoolYearStatus,
    Student,
    User,
    UserRole,
)
from ...rbac import require_admin
from ...services.clerk import (
    fetch_user_lock_status,
    fetch_users_lock_status,
    lock_user_account,
    unlock_user_account,
    update_user_personal_names,
    update_user_public_metadata,
)
from ...services.activity_log import diff_values, record_activity
from ...services.adviser_core import reconcile_adviser_program_assignments
from ...services.helpers import (
    get_active_school_year_id,
    get_program_id_to_department_code_map,
    program_uuid_for_department_code,
)
from .program_assignment import get_adviser_departments_map_for_school_year

router = APIRouter(prefix="/advisers")


class AdviserResponse(BaseModel):
    id: str
    name: str
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    email: str | None
    # The department field is the primary (first) program code for backward compatibility,
    # while departments carries the full list of programs the adviser is assigned to.
    department: str | None
    departments: list[str] = Field(default_factory=list)
    school_year: str | None
    is_active: bool
    created_at: datetime

# The history response intentionally excludes email and active status since those can change independently of assignments.
class AdviserAssignmentHistoryResponse(BaseModel):
    school_year_id: str
    school_year_name: str
    department: str | None
    assigned_at: datetime

# The update request keeps first/middle/last names separate for validation and direct DB storage.
class AdviserUpdateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    department_codes: list[str] = Field(default_factory=list)
    school_year_name: str = Field(min_length=4, max_length=64)

    # The validators ensure that required text fields are not just whitespace and that optional 
    # fields are normalized to None if empty.
    @field_validator("first_name", "last_name", "school_year_name")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field is required.")
        return normalized

    @field_validator("middle_name")
    @classmethod
    def normalize_middle_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("Email is required.")
        return normalized

    @field_validator("department_codes")
    @classmethod
    def normalize_department_codes(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for code in value:
            stripped = (code or "").strip().upper()
            if stripped:
                normalized.append(stripped)
        return list(dict.fromkeys(normalized))


# The status update request is intentionally minimal since it only needs to toggle the active status, 
# which is determined by locking or unlocking the user account in Clerk.
class AdviserStatusUpdateRequest(BaseModel):
    is_active: bool

# The helper functions below are used to build adviser names, resolve active status,
# and fetch the latest adviser assignments efficiently.
# To handle edge cases such as missing
def _build_adviser_name(user: User) -> str:
    first_name = (user.first_name or "").strip()
    middle_name = (user.middle_name or "").strip()
    last_name = (user.last_name or "").strip()
    full_name = " ".join(part for part in (first_name, middle_name, last_name) if part)
    if full_name:
        return full_name
    if user.email:
        return user.email.split("@", 1)[0]
    return "Unnamed Adviser"

# The function below determines the active status of an adviser based on their user role and lock status.
#Lock status is a backend API from Clerk that indicates whether the user's account is locked (inactive) or unlocked (active).
def _resolve_is_active(user_role: UserRole, is_locked: bool | None) -> bool:
    if user_role != UserRole.ADVISER:
        return False
    if is_locked is None:
        return True
    return not is_locked

# The function below fetches the latest adviser assignment for each adviser ID provided, returning a mapping of adviser ID to their most recent department code and school year name. This is used to efficiently populate the department and school year information when listing advisers.
async def _get_latest_adviser_assignment_map(
    db: SessionDep,
    adviser_ids: list[UUID],
) -> dict[UUID, tuple[str | None, str | None]]:
    if not adviser_ids:
        return {}

    # Fetch the mapping of program IDs to department codes once to avoid redundant queries in the loop below.
    program_id_to_code = await get_program_id_to_department_code_map(db)

    # The query below retrieves all adviser assignments for the given adviser IDs, 
    # along with the associated school year names, ordered by the most recent update or creation time. 
    # The loop then constructs a mapping of adviser ID to their latest department code and school year name, 
    # ensuring that only the most recent assignment is kept for each adviser.
    stmt = (
        select(
            ProgramAdviserAssignment.adviser_id,
            ProgramAdviserAssignment.program_id,
            SchoolYear.name,
        )
        .join(SchoolYear, ProgramAdviserAssignment.school_year_id == SchoolYear.id)
        .where(ProgramAdviserAssignment.adviser_id.in_(adviser_ids))
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    rows = (await db.execute(stmt)).all()

    latest_assignment_map: dict[UUID, tuple[str | None, str | None]] = {}
    for adviser_id, program_id, school_year_name in rows:
        if adviser_id in latest_assignment_map:
            continue
        latest_assignment_map[adviser_id] = (program_id_to_code.get(program_id), school_year_name)

    return latest_assignment_map


# The route handlers below implement the API endpoints for listing advisers, 
# viewing adviser assignment history, updating adviser details, and toggling adviser active status. 
# Each handler includes appropriate error handling and data validation to ensure robust behavior.
@router.get("", response_model=list[AdviserResponse])
async def list_advisers(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    # The query below retrieves all advisers along with their associated user information, 
    # ordered by creation date.
    stmt = (
        select(Adviser, User)
        .join(User, Adviser.user_id == User.id)
        .where(User.role != UserRole.ADMIN)
        .order_by(Adviser.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    active_school_year_id = await get_active_school_year_id(db)
    active_school_year_name: str | None = None
    if active_school_year_id is not None:
        active_school_year = await db.get(SchoolYear, active_school_year_id)
        active_school_year_name = active_school_year.name if active_school_year is not None else None

    assignment_map = await get_adviser_departments_map_for_school_year(
        db,
        [adviser.id for adviser, _ in rows],
        active_school_year_id,
    )
    clerk_ids = [user.clerk_user_id for _, user in rows]
    lock_state_map = await fetch_users_lock_status(clerk_ids)
    adviser_lock_map: dict[UUID, bool | None] = {
        adviser.id: lock_state_map.get(user.clerk_user_id)
        for adviser, user in rows
    }

    return [
        AdviserResponse(
            id=str(adviser.id),
            name=_build_adviser_name(user),
            first_name=user.first_name,
            middle_name=user.middle_name,
            last_name=user.last_name,
            email=user.email,
            department=(assignment_map.get(adviser.id) or [None])[0],
            departments=assignment_map.get(adviser.id) or [],
            school_year=active_school_year_name,
            is_active=_resolve_is_active(user.role, adviser_lock_map.get(adviser.id)),
            created_at=adviser.created_at,
        )
        for adviser, user in rows
    ]

# The route below retrieves the assignment history for a specific adviser, 
# returning a list of their past and current department assignments along with the associated school years. 
# The history is ordered by the most recent assignment first, and only one entry per school year is included to reflect the latest assignment for that year.
@router.get("/{adviser_id}/assignments", response_model=list[AdviserAssignmentHistoryResponse])
async def list_adviser_assignment_history(
    adviser_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    adviser = await db.get(Adviser, adviser_id)
    if adviser is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adviser not found.")

    program_id_to_code = await get_program_id_to_department_code_map(db)
    stmt = (
        select(
            ProgramAdviserAssignment.school_year_id,
            SchoolYear.name,
            ProgramAdviserAssignment.program_id,
            ProgramAdviserAssignment.updated_at,
            ProgramAdviserAssignment.created_at,
            SchoolYear.start_date,
        )
        .join(SchoolYear, ProgramAdviserAssignment.school_year_id == SchoolYear.id)
        .where(ProgramAdviserAssignment.adviser_id == adviser_id)
        .order_by(
            desc(SchoolYear.start_date),
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    rows = (await db.execute(stmt)).all()

    seen_school_year_ids: set[UUID] = set()
    history: list[AdviserAssignmentHistoryResponse] = []
    for school_year_id, school_year_name, program_id, updated_at, created_at, _start_date in rows:
        if school_year_id in seen_school_year_ids:
            continue
        seen_school_year_ids.add(school_year_id)
        history.append(
            AdviserAssignmentHistoryResponse(
                school_year_id=str(school_year_id),
                school_year_name=school_year_name,
                department=program_id_to_code.get(program_id),
                assigned_at=updated_at or created_at,
            )
        )

    return history


# The route below updates the details of a specific adviser, 
# including their name, email, department assignment, and associated school year.
@router.patch("/{adviser_id}", response_model=AdviserResponse)
async def update_adviser(
    adviser_id: UUID,
    payload: AdviserUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):

    stmt = (
        select(Adviser, User)
        .join(User, Adviser.user_id == User.id)
        .where(Adviser.id == adviser_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adviser not found.")

    adviser, user = row
    if not user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Adviser has no Clerk user id.",
        )

    # The query below retrieves the school year based on the provided name, ensuring that it exists and is not closed, 
    # since closed school years cannot be used for adviser assignments.
    school_year_stmt = select(SchoolYear).where(func.lower(SchoolYear.name) == payload.school_year_name.lower())
    school_year = (await db.execute(school_year_stmt)).scalar_one_or_none()
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed school years cannot be used for adviser assignments.",
        )

    # Programs the adviser already holds for this school year. Deactivating a
    # program does not clear its assignments, and callers send the complete
    # remaining list, so these codes can legitimately be inactive.
    held_program_ids_stmt = select(ProgramAdviserAssignment.program_id).where(
        ProgramAdviserAssignment.adviser_id == adviser.id,
        ProgramAdviserAssignment.school_year_id == school_year.id,
    )
    held_program_ids = set((await db.execute(held_program_ids_stmt)).scalars().all())

    # Validate every requested department code before touching any assignments,
    # so a bad code never partially mutates the data. An inactive program is only
    # rejected when it would be a new assignment.
    for code in payload.department_codes:
        department_stmt = select(Department).where(
            func.lower(Department.code) == code.lower()
        )
        _department = (await db.execute(department_stmt)).scalar_one_or_none()
        if _department is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f'Department code "{code}" does not exist.',
            )
        if not _department.is_active and program_uuid_for_department_code(code) not in held_program_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Department code "{code}" is inactive.',
            )

# The query below checks for email conflicts by looking for any other user with the same email address (case-insensitive) but a different user ID.
# If a conflict is found, a 409 Conflict error is raised to indicate that the email address is already in use by another user.
    existing_email_stmt = select(User.id).where(
        func.lower(User.email) == payload.email.lower(),
        User.id != user.id,
    )
    email_conflict = (await db.execute(existing_email_stmt)).scalar_one_or_none()
    if email_conflict is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Email "{payload.email}" is already used by another user.',
        )

    updated_personal_names = await update_user_personal_names(
        user.clerk_user_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    if updated_personal_names is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to update Clerk personal name fields for adviser.",
        )

    # Snapshot the current values for the activity log before anything is mutated.
    program_code_map = await get_program_id_to_department_code_map(db)
    before_values = {
        "first_name": user.first_name,
        "middle_name": user.middle_name,
        "last_name": user.last_name,
        "email": user.email,
        "departments": sorted(
            program_code_map[pid] for pid in held_program_ids if pid in program_code_map
        ),
    }

    # Reconcile diff-based: add missing assignments, remove ones not in the list.
    # An empty list removes every assignment for the adviser in the school year.
    assigned_codes = await reconcile_adviser_program_assignments(
        db,
        adviser_id=adviser.id,
        school_year_id=school_year.id,
        department_codes=payload.department_codes,
    )

    user.first_name = updated_personal_names[0] or payload.first_name
    user.middle_name = payload.middle_name
    user.last_name = updated_personal_names[1] or payload.last_name
    user.email = payload.email

    after_values = {
        "first_name": user.first_name,
        "middle_name": user.middle_name,
        "last_name": user.last_name,
        "email": user.email,
        "departments": sorted(assigned_codes),
    }
    previous_values, new_values = diff_values(before_values, after_values)
    if previous_values:
        await record_activity(
            db,
            current_user,
            action="update",
            entity_type="adviser",
            entity_id=adviser.id,
            entity_label=_build_adviser_name(user),
            school_year_id=school_year.id,
            previous_values=previous_values,
            new_values=new_values,
        )

    await db.commit()

    # After updating the adviser’s details and department assignment, 
    # the code fetches the current lock status of the user from Clerk to determine their active status for the response.
    lock_state = await fetch_user_lock_status(user.clerk_user_id)

    # The response includes the updated adviser information, 
    # including their name, email, department, associated school year, active status, and creation date.
    return AdviserResponse(
        id=str(adviser.id),
        name=_build_adviser_name(user),
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        email=user.email,
        department=assigned_codes[0] if assigned_codes else None,
        departments=assigned_codes,
        school_year=school_year.name,
        is_active=_resolve_is_active(user.role, lock_state),
        created_at=adviser.created_at,
    )

# The route below toggles the active status of a specific adviser by locking or unlocking their user account in Clerk.
@router.post("/{adviser_id}/status", response_model=AdviserResponse)
async def update_adviser_status(
    adviser_id: UUID,
    payload: AdviserStatusUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):

    # The query below retrieves the adviser along with their associated user information based on the provided adviser ID.
    stmt = (
        select(Adviser, User)
        .join(User, Adviser.user_id == User.id)
        .where(Adviser.id == adviser_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adviser not found.")

    adviser, user = row
    if not user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Adviser has no Clerk user id.",
        )
    # Read the current Clerk lock state so repeated requests are not logged as changes.
    previous_role = user.role.value
    previous_locked = await fetch_user_lock_status(user.clerk_user_id)

# The code below attempts to lock or unlock the user account in Clerk based on the desired active status provided in the request payload.
    try:
        if payload.is_active:
            lock_state = await unlock_user_account(user.clerk_user_id)
            # Repair a stale role: an adviser whose role was demoted (e.g. to student)
            # still has an adviser profile, so re-activating also restores the role.
            if user.role == UserRole.STUDENT:
                user.role = UserRole.ADVISER
                await db.execute(delete(Student).where(Student.user_id == user.id))
                await db.commit()
                await db.refresh(user)
                if user.clerk_user_id:
                    await update_user_public_metadata(user.clerk_user_id, {"role": UserRole.ADVISER.value})
        else:
            lock_state = await lock_user_account(user.clerk_user_id)
    except RuntimeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error

    # Log only real changes: a lock-state change (or an unknown previous state), or a role repair.
    state_changed = previous_locked is None or previous_locked == payload.is_active
    role_changed = user.role.value != previous_role
    if state_changed or role_changed:
        previous_values: dict = {}
        new_values: dict = {}
        if state_changed:
            previous_values["is_active"] = None if previous_locked is None else not previous_locked
            new_values["is_active"] = payload.is_active
        if role_changed:
            previous_values["role"] = previous_role
            new_values["role"] = user.role.value
        await record_activity(
            db,
            current_user,
            action=("activate" if payload.is_active else "deactivate") if state_changed else "update",
            entity_type="adviser",
            entity_id=adviser.id,
            entity_label=_build_adviser_name(user),
            previous_values=previous_values,
            new_values=new_values,
        )
    await db.commit()

    # After updating the lock status in Clerk, the code fetches the active school year information and the adviser’s current department assignment to include in the response.
    active_school_year_id = await get_active_school_year_id(db)
    active_school_year_name: str | None = None
    if active_school_year_id is not None:
        active_school_year = await db.get(SchoolYear, active_school_year_id)
        active_school_year_name = active_school_year.name if active_school_year is not None else None
    assignment_map = await get_adviser_departments_map_for_school_year(db, [adviser.id], active_school_year_id)
    department_codes = assignment_map.get(adviser.id) or []

    # The response includes the updated adviser information, reflecting the new active status based on the lock state in Clerk, along with their name, email, department(s), associated school year, and creation date.
    return AdviserResponse(
        id=str(adviser.id),
        name=_build_adviser_name(user),
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        email=user.email,
        department=department_codes[0] if department_codes else None,
        departments=department_codes,
        school_year=active_school_year_name,
        is_active=_resolve_is_active(user.role, lock_state),
        created_at=adviser.created_at,
    )
