from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, select

from ...database import SessionDep
from ...models import Adviser, Department, Program, ProgramAdviserAssignment, SchoolYear, SchoolYearStatus, Student, User, UserRole
from ...rbac import require_admin
from ...services.adviser_core import reconcile_adviser_program_assignments
from ...services.helpers import (
    get_active_school_year_id,
    program_uuid_for_department_code,
)
from .program_assignment import (
    get_adviser_departments_map_for_school_year,
    get_department_adviser_counts_for_school_year,
)

router = APIRouter(prefix="/departments")

# The code below defines the request and response models for department-related operations,
# including creating and updating departments, as well as updating adviser department assignments.
class DepartmentCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Department code is required.")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Department name is required.")
        return normalized

# The DepartmentUpdateRequest model allows for partial updates to a department, 
# where any of the fields (code, name, is_active) can be optionally provided.
class DepartmentUpdateRequest(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=30)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Department code is required.")
        return normalized

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Department name is required.")
        return normalized

# The AdviserDepartmentUpdateRequest model is used for updating an adviser's program assignments,
# where department_codes is the list of academic program codes the adviser should be assigned to
# for the given school year. An empty list removes all assignments for that school year.
class AdviserDepartmentUpdateRequest(BaseModel):
    department_codes: list[str] = Field(default_factory=list)
    school_year_id: UUID

    @field_validator("department_codes")
    @classmethod
    def normalize_department_codes(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for code in value:
            stripped = (code or "").strip().upper()
            if stripped:
                normalized.append(stripped)
        return list(dict.fromkeys(normalized))

# The DepartmentResponse model defines the structure of the response when retrieving department information,
# including the department’s ID, code, name, active status, counts of advisers and students, and timestamps for creation and last update.
class DepartmentResponse(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool
    adviser_count: int
    student_count: int
    created_at: datetime
    updated_at: datetime

# The AdviserResponse model defines the structure of the response when retrieving adviser information for department assignment,
# including the adviser’s ID, name, email, associated department(s), active status, and creation.
# department is the primary (first) code for backward compatibility while departments holds the full list.
class AdviserResponse(BaseModel):
    id: str
    name: str
    email: str | None
    department: str | None
    departments: list[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime

# The function _build_adviser_name constructs a display name for an adviser based on their first and last name,
# falling back to their email username if the name is not available, and ultimately returning "Unnamed
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

# The function _serialize_department takes a Department object along with optional counts of advisers and students,
# and returns a DepartmentResponse object that can be returned in API responses.
def _serialize_department(
    department: Department,
    adviser_count: int = 0,
    student_count: int = 0,
) -> DepartmentResponse:
    return DepartmentResponse(
        id=str(department.id),
        code=department.code,
        name=department.name,
        is_active=department.is_active,
        adviser_count=adviser_count,
        student_count=student_count,
        created_at=department.created_at,
        updated_at=department.updated_at,
    )

# The function _serialize_adviser takes an Adviser object, the associated User object, and the list of department codes,
# and returns an AdviserResponse object that can be returned in API responses for adviser information related to department assignment.
# The first code is surfaced in department for backward compatibility while the full list goes into departments.
def _serialize_adviser(adviser: Adviser, user: User, department_codes: list[str]) -> AdviserResponse:
    return AdviserResponse(
        id=str(adviser.id),
        name=_build_adviser_name(user),
        email=user.email,
        department=department_codes[0] if department_codes else None,
        departments=department_codes,
        is_active=user.role == UserRole.ADVISER,
        created_at=adviser.created_at,
    )

# The function _get_department_counts retrieves the counts of advisers and students for each department based on the provided school year ID.
async def _get_department_counts(db: SessionDep, school_year_id: UUID | None) -> tuple[dict[str, int], dict[str, int]]:
    resolved_school_year_id = school_year_id or await get_active_school_year_id(db)
    adviser_counts = await get_department_adviser_counts_for_school_year(db, resolved_school_year_id)

    student_counts_stmt = (
        select(
            Department.code,
            func.count(Student.id).label("student_count"),
        )
        .join(Student, Student.program_id == Department.id)
        .where(Student.school_year_id == resolved_school_year_id)
        .group_by(Department.code)
    )
    student_count_rows = (await db.execute(student_counts_stmt)).all()
    student_counts = {row.code.lower(): row.student_count for row in student_count_rows if row.code}

    return adviser_counts, student_counts

# The function _get_department_by_code retrieves a Department object from the database based on the provided department code,
async def _get_department_by_code(db: SessionDep, code: str) -> Department | None:
    stmt = select(Department).where(func.lower(Department.code) == code.lower())
    return (await db.execute(stmt)).scalar_one_or_none()

# The route below retrieves a list of all departments, optionally filtered by a specific school year ID, and includes counts of advisers and students for each department.
@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    school_year_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    # The code retrieves all departments from the database, ordered by their code in ascending order. 
    # It then calls the helper function _get_department_counts to retrieve the counts of advisers and students for each department based on the provided school year ID (or the active school year if none is provided). Finally, it constructs a list of DepartmentResponse objects for each department, including the respective adviser and student counts, and returns this list as the API response.
    stmt = select(Department).order_by(Department.code.asc())
    departments = (await db.execute(stmt)).scalars().all()
    adviser_counts, student_counts = await _get_department_counts(db, school_year_id)

    # The response includes the department’s ID, code, name, active status, counts of advisers and students, and timestamps for creation and last update.
    return [
        _serialize_department(
            department,
            adviser_count=adviser_counts.get(department.code.lower(), 0),
            student_count=student_counts.get(department.code.lower(), 0),
        )
        for department in departments
    ]


# The route below retrieves a list of advisers along with their associated user information, 
# optionally filtered by a specific school year ID for department assignment purposes.
@router.get("/advisers", response_model=list[AdviserResponse])
async def list_advisers_for_department_assignment(
    school_year_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    # The code retrieves all advisers from the database, joining with their associated user information, and orders them by their creation date in descending order. It then resolves the school year ID to use for fetching department assignments (either the provided school year ID or the active school year ID). Next, it calls the helper function get_adviser_departments_map_for_school_year to retrieve a mapping of adviser IDs to their assigned department codes for the specified school year. Finally, it constructs a list of AdviserResponse objects for each adviser, including their name, email, associated department code (if any), active status, and creation date, and returns this list as the API response.
    # The response includes the adviser’s ID, name, email, associated department, active status, and creation date.
    stmt = (
        select(Adviser, User)
        .join(User, Adviser.user_id == User.id)
        .order_by(Adviser.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    resolved_school_year_id = school_year_id or await get_active_school_year_id(db)
    adviser_departments_map = await get_adviser_departments_map_for_school_year(
        db,
        [adviser.id for adviser, _ in rows],
        resolved_school_year_id,
    )

    return [
        _serialize_adviser(
            adviser,
            user,
            department_codes=adviser_departments_map.get(adviser.id, []),
        )
        for adviser, user in rows
    ]

# The route below creates a new department based on the provided request payload, ensuring that the department code is unique and properly formatted.
@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    payload: DepartmentCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    # The code first checks if a department with the same code already exists in the database by calling the helper function _get_department_by_code. If a department with the same code is found, it raises an HTTP 409 Conflict error indicating that the department code already exists. If no existing department is found, it proceeds to create a new Department object with the provided code and name, sets its active status to True, and adds it to the database session. After committing the transaction and refreshing the department instance to get its generated ID and timestamps, it returns a DepartmentResponse object representing the newly created department, including its ID, code, name, active status, counts of advisers and students (both set to 0 for a new department), and timestamps for creation and last update.
    existing = await _get_department_by_code(db, payload.code)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Department code "{payload.code}" already exists.',
        )

    # The response includes the department’s ID, code, name, active status, counts of advisers and students (both set to 0 for a new department), and timestamps for creation and last update.
    department = Department(
        code=payload.code,
        name=payload.name,
        is_active=True,
    )
    db.add(department)
    await db.commit()
    await db.refresh(department)
    return _serialize_department(department, adviser_count=0, student_count=0)

# The route below updates an existing department based on the provided department ID and request payload, allowing for changes to the department’s code, name, and active status while ensuring that the new code (if changed) is unique and properly formatted.
@router.patch("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: UUID,
    payload: DepartmentUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    # The code first checks if at least one of the fields (code, name, is_active) is provided in the request payload. 
    # If none of the fields are provided, it raises an HTTP 400 Bad Request error indicating that at least one field must be provided to update a department.
    if payload.code is None and payload.name is None and payload.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field must be provided to update a department.",
        )

    # The code then retrieves the existing department from the database using the provided department ID.
    #  If the department is not found, it raises an HTTP 404 Not Found error indicating that the department does not exist. 
    # If the department is found, it proceeds to update the department’s code, name, and active status based on the provided payload. 
    # If the code is being changed, it checks for uniqueness of the new code and updates related program assignments and student records accordingly. 
    # Finally, it commits the changes to the database, refreshes the department instance, and returns a DepartmentResponse object representing the updated department, including its ID, code, name, active status, counts of advisers and students (retrieved using the helper function _get_department_counts), and timestamps for creation and last update.
    department = await db.get(Department, department_id)
    if department is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")

    previous_code = department.code

    # If the department code is being updated, the code checks if the new code already exists for a different department. If it does, it raises an HTTP 409 Conflict error indicating that the department code already exists. If the new code is unique, it updates the department’s code and also updates related program assignments and student records to reflect the new department code.
    if payload.code is not None and payload.code.lower() != department.code.lower():
        existing = await _get_department_by_code(db, payload.code)
        if existing is not None and existing.id != department.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'Department code "{payload.code}" already exists.',
            )
        department.code = payload.code

    if payload.name is not None:
        department.name = payload.name

    if payload.is_active is not None:
        department.is_active = payload.is_active

    # If the department code has changed, the code updates related program assignments for advisers and student records to reflect the new department code. 
    # It retrieves the old and new program IDs based on the previous and new department codes, respectively. 
    # If the program ID has changed, it checks if a program with the new ID exists and creates it if it does not. 
    # It then updates any existing program adviser assignments to point to the new program ID. 
    # Finally, it updates all student records that were associated with the old department code to use the new department code.
    code_changed = previous_code.lower() != department.code.lower()
    if code_changed:
        old_program_id = program_uuid_for_department_code(previous_code)
        new_program_id = program_uuid_for_department_code(department.code)

        if old_program_id != new_program_id:
            target_program = await db.get(Program, new_program_id)
            if target_program is None:
                db.add(Program(id=new_program_id))
                await db.flush()

            assignment_stmt = select(ProgramAdviserAssignment).where(
                ProgramAdviserAssignment.program_id == old_program_id
            )
            assignments = (await db.execute(assignment_stmt)).scalars().all()
            for assignment in assignments:
                assignment.program_id = new_program_id

    await db.commit()
    await db.refresh(department)

    adviser_counts, student_counts = await _get_department_counts(db, None)
    return _serialize_department(
        department,
        adviser_count=adviser_counts.get(department.code.lower(), 0),
        student_count=student_counts.get(department.code.lower(), 0),
    )

# The route below updates an adviser’s department assignment based on the provided adviser ID and request payload, allowing for changes to the adviser’s associated department for a specific school year while ensuring that the new department code (if provided) is valid and active.
@router.patch("/advisers/{adviser_id}/department", response_model=AdviserResponse)
async def update_adviser_department(
    adviser_id: UUID,
    payload: AdviserDepartmentUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = (
        select(Adviser, User)
        .join(User, Adviser.user_id == User.id)
        .where(Adviser.id == adviser_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adviser not found.")

    # The code retrieves the adviser along with their associated user information based on the provided adviser ID. 
    # If the adviser is not found, it raises an HTTP 404 Not Found error indicating that the adviser does not exist.
    #  If the adviser is found, it proceeds to update the adviser’s department assignment based on the provided payload, which includes the new department code (or null to remove the assignment) 
    # and the school year ID for which the assignment should be updated.
    adviser, user = row
    school_year = await db.get(SchoolYear, payload.school_year_id)
    if school_year is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School year not found.",
        )
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed school years cannot be used for adviser assignments.",
        )

# Validate that every requested department code exists and is active before
    # touching any assignments, so a bad code never partially mutates the data.
    for code in payload.department_codes:
        _department = await _get_department_by_code(db, code)
        if _department is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f'Department code "{code}" does not exist.',
            )
        if not _department.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Department code "{code}" is inactive.',
            )

    # Reconcile diff-based: add missing assignments, remove ones not in the list.
    assigned_codes = await reconcile_adviser_program_assignments(
        db,
        adviser_id=adviser.id,
        school_year_id=school_year.id,
        department_codes=payload.department_codes,
    )

    await db.commit()
    return _serialize_adviser(adviser, user, department_codes=assigned_codes)
