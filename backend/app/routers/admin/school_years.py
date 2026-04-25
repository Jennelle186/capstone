from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, select

from ...database import SessionDep
from ...models import Adviser, Department, ProgramAdviserAssignment, SchoolYear, SchoolYearStatus, User
from ...rbac import require_admin
from .program_assignment import program_uuid_for_department_code

router = APIRouter(prefix="/school-years")


class SchoolYearResponse(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    status: SchoolYearStatus
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SchoolYearCreateRequest(BaseModel):
    name: str = Field(min_length=4, max_length=64)
    start_date: date
    end_date: date
    status: SchoolYearStatus = SchoolYearStatus.UPCOMING
    set_as_active: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        # Trim and reject blank school year names.
        normalized = value.strip()
        if not normalized:
            raise ValueError("School year name is required.")
        return normalized


class SchoolYearUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=4, max_length=64)
    start_date: date | None = None
    end_date: date | None = None
    status: SchoolYearStatus | None = None
    set_as_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        # Trim optional names while preserving `None` for partial updates.
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("School year name is required.")
        return normalized


class SchoolYearDepartmentAssignmentResponse(BaseModel):
    department_id: str
    department_code: str
    department_name: str
    department_is_active: bool
    adviser_id: str | None
    adviser_name: str | None
    adviser_email: str | None


def serialize_school_year(school_year: SchoolYear) -> SchoolYearResponse:
    # Convert ORM school year rows into API-safe response objects.
    return SchoolYearResponse(
        id=str(school_year.id),
        name=school_year.name,
        start_date=school_year.start_date,
        end_date=school_year.end_date,
        status=school_year.status,
        is_active=school_year.is_active,
        created_at=school_year.created_at,
        updated_at=school_year.updated_at,
    )


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


def validate_date_range(start_date: date, end_date: date) -> None:
    # Protect against inverted date ranges at API level.
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date cannot be earlier than start date.",
        )


async def get_school_year_or_404(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    # Load one school year or fail with a 404.
    stmt = select(SchoolYear).where(SchoolYear.id == school_year_id)
    school_year = (await db.execute(stmt)).scalar_one_or_none()
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    return school_year


async def ensure_unique_name(db: SessionDep, name: str, exclude_id: UUID | None = None) -> None:
    # Enforce case-insensitive uniqueness for school year names.
    stmt = select(SchoolYear).where(func.lower(SchoolYear.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(SchoolYear.id != exclude_id)

    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'School year "{name}" already exists.',
        )


async def activate_school_year(db: SessionDep, school_year: SchoolYear) -> None:
    # Deactivate previous active row and promote the selected school year.
    stmt = select(SchoolYear).where(
        SchoolYear.is_active.is_(True),
        SchoolYear.id != school_year.id,
    )
    active_rows = (await db.execute(stmt)).scalars().all()
    for active_row in active_rows:
        active_row.is_active = False
        if active_row.status == SchoolYearStatus.ACTIVE:
            active_row.status = SchoolYearStatus.CLOSED

    if active_rows:
        # Flush deactivation first so the partial unique index is never violated.
        await db.flush()

    school_year.is_active = True
    school_year.status = SchoolYearStatus.ACTIVE


@router.get("", response_model=list[SchoolYearResponse])
async def list_school_years(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # List all school years with the active one surfaced first.
    del current_user

    stmt = select(SchoolYear).order_by(
        desc(SchoolYear.is_active),
        desc(SchoolYear.start_date),
        desc(SchoolYear.created_at),
    )
    school_years = (await db.execute(stmt)).scalars().all()
    return [serialize_school_year(school_year) for school_year in school_years]


@router.get("/active", response_model=SchoolYearResponse | None)
async def get_active_school_year(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Return the currently active school year, if any exists.
    del current_user

    stmt = (
        select(SchoolYear)
        .where(SchoolYear.is_active.is_(True))
        .order_by(desc(SchoolYear.updated_at))
    )
    school_year = (await db.execute(stmt)).scalars().first()
    if school_year is None:
        return None
    return serialize_school_year(school_year)


@router.get("/{school_year_id}/assignments", response_model=list[SchoolYearDepartmentAssignmentResponse])
async def list_school_year_assignments(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # List department-to-adviser assignments for one school year.
    del current_user

    await get_school_year_or_404(db, school_year_id)

    departments_stmt = select(Department).order_by(Department.code.asc())
    departments = (await db.execute(departments_stmt)).scalars().all()

    assignments_stmt = (
        select(ProgramAdviserAssignment, Adviser, User)
        .join(Adviser, ProgramAdviserAssignment.adviser_id == Adviser.id)
        .join(User, Adviser.user_id == User.id)
        .where(ProgramAdviserAssignment.school_year_id == school_year_id)
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    assignment_rows = (await db.execute(assignments_stmt)).all()

    latest_by_program_id: dict[UUID, tuple[Adviser, User]] = {}
    for assignment, adviser, user in assignment_rows:
        if assignment.program_id in latest_by_program_id:
            continue
        latest_by_program_id[assignment.program_id] = (adviser, user)

    response: list[SchoolYearDepartmentAssignmentResponse] = []
    for department in departments:
        assignment = latest_by_program_id.get(program_uuid_for_department_code(department.code))
        adviser_id: str | None = None
        adviser_name: str | None = None
        adviser_email: str | None = None

        if assignment is not None:
            adviser, user = assignment
            adviser_id = str(adviser.id)
            adviser_name = _build_adviser_name(user)
            adviser_email = user.email

        response.append(
            SchoolYearDepartmentAssignmentResponse(
                department_id=str(department.id),
                department_code=department.code,
                department_name=department.name,
                department_is_active=department.is_active,
                adviser_id=adviser_id,
                adviser_name=adviser_name,
                adviser_email=adviser_email,
            )
        )

    return response


@router.post("", response_model=SchoolYearResponse, status_code=status.HTTP_201_CREATED)
async def create_school_year(
    payload: SchoolYearCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Create a school year and optionally set it as the active one.
    del current_user

    validate_date_range(payload.start_date, payload.end_date)
    if payload.status == SchoolYearStatus.CLOSED and payload.set_as_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A closed school year cannot be set as active.",
        )

    await ensure_unique_name(db, payload.name)

    school_year = SchoolYear(
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        is_active=False,
    )
    db.add(school_year)
    await db.flush()

    activate_requested = payload.set_as_active or payload.status == SchoolYearStatus.ACTIVE
    if activate_requested:
        await activate_school_year(db, school_year)

    await db.commit()
    await db.refresh(school_year)
    return serialize_school_year(school_year)


@router.patch("/{school_year_id}", response_model=SchoolYearResponse)
async def update_school_year(
    school_year_id: UUID,
    payload: SchoolYearUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Update school year details and active status controls.
    del current_user

    school_year = await get_school_year_or_404(db, school_year_id)

    if payload.name is not None and payload.name != school_year.name:
        await ensure_unique_name(db, payload.name, exclude_id=school_year.id)
        school_year.name = payload.name

    effective_start = payload.start_date if payload.start_date is not None else school_year.start_date
    effective_end = payload.end_date if payload.end_date is not None else school_year.end_date
    validate_date_range(effective_start, effective_end)

    if payload.start_date is not None:
        school_year.start_date = payload.start_date
    if payload.end_date is not None:
        school_year.end_date = payload.end_date

    next_status = payload.status if payload.status is not None else school_year.status
    if next_status == SchoolYearStatus.CLOSED and payload.set_as_active is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A closed school year cannot be set as active.",
        )

    if payload.status is not None:
        school_year.status = payload.status

    # Explicit activation/deactivation from the toggle takes precedence over status.
    if payload.set_as_active is True:
        await activate_school_year(db, school_year)
    elif payload.set_as_active is False:
        if school_year.is_active:
            school_year.is_active = False
        if school_year.status == SchoolYearStatus.ACTIVE:
            school_year.status = SchoolYearStatus.UPCOMING
    else:
        # If toggle is not specified, infer activation from status updates.
        if next_status == SchoolYearStatus.ACTIVE:
            await activate_school_year(db, school_year)
        elif next_status in {SchoolYearStatus.UPCOMING, SchoolYearStatus.CLOSED} and school_year.is_active:
            school_year.is_active = False

    await db.commit()
    await db.refresh(school_year)
    return serialize_school_year(school_year)


@router.post("/{school_year_id}/set-active", response_model=SchoolYearResponse)
async def set_school_year_active(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Promote one existing school year to active.
    del current_user

    school_year = await get_school_year_or_404(db, school_year_id)
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed school years cannot be activated.",
        )

    await activate_school_year(db, school_year)
    await db.commit()
    await db.refresh(school_year)
    return serialize_school_year(school_year)


@router.post("/{school_year_id}/close", response_model=SchoolYearResponse)
async def close_school_year(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Close a school year and ensure it is not active.
    del current_user

    school_year = await get_school_year_or_404(db, school_year_id)
    school_year.status = SchoolYearStatus.CLOSED
    school_year.is_active = False

    await db.commit()
    await db.refresh(school_year)
    return serialize_school_year(school_year)


@router.post("/{school_year_id}/set-inactive", response_model=SchoolYearResponse)
async def set_school_year_inactive(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Mark one school year as inactive without closing it.
    del current_user

    school_year = await get_school_year_or_404(db, school_year_id)
    school_year.is_active = False
    if school_year.status == SchoolYearStatus.ACTIVE:
        school_year.status = SchoolYearStatus.UPCOMING

    await db.commit()
    await db.refresh(school_year)
    return serialize_school_year(school_year)
