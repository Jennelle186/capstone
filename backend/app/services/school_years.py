from __future__ import annotations

import csv
from datetime import date
from io import StringIO
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import ProgrammingError

from ..database import SessionDep
from ..models import (
    Adviser,
    AdminAuditLog,
    Department,
    DocumentType,
    ProgramAdviserAssignment,
    SchoolYear,
    SchoolYearRequirement,
    SchoolYearStatus,
    User,
)
from .helpers import program_uuid_for_department_code
from ..schemas.school_years import (
    AdminAuditLogResponse,
    SchoolYearActivationPreviewResponse,
    SchoolYearAutoClosureResponse,
    SchoolYearCreateRequest,
    SchoolYearDepartmentAssignmentResponse,
    SchoolYearResponse,
    SchoolYearRolloverRequest,
    SchoolYearUpdateRequest,
)

# Helper function to create a snapshot of a school year's key attributes for logging purposes
def school_year_snapshot(school_year: SchoolYear) -> dict[str, object]:
    return {
        "id": str(school_year.id),
        "name": school_year.name,
        "start_date": school_year.start_date.isoformat(),
        "end_date": school_year.end_date.isoformat(),
        "auto_closure_date": school_year.auto_closure_date.isoformat() if school_year.auto_closure_date else None,
        "status": school_year.status.value,
        "is_active": school_year.is_active,
    }

# Helper function to build an adviser's display name from their user information
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

# Helper function to build a display name for a user, with a fallback if the user is None or has no name/email
def _build_user_display_name(user: User | None, fallback: str | None = None) -> str | None:
    if user is None:
        return fallback

    first_name = (user.first_name or "").strip()
    middle_name = (user.middle_name or "").strip()
    last_name = (user.last_name or "").strip()
    full_name = " ".join(part for part in (first_name, middle_name, last_name) if part)
    if full_name:
        return full_name
    return user.email or fallback

# Helper function to validate that the provided date range is logical (end date is not before start date, etc.)
def validate_date_range(start_date: date, end_date: date, auto_closure_date: date | None = None) -> None:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date cannot be earlier than start date.",
        )
    if auto_closure_date is not None and auto_closure_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto closure date cannot be earlier than start date.",
        )

# Helper function to retrieve a school year by ID, or raise a 404 error if it does not exist
async def get_school_year_or_404(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    stmt = select(SchoolYear).where(SchoolYear.id == school_year_id)
    school_year = (await db.execute(stmt)).scalar_one_or_none()
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    return school_year

# Helper function to ensure that a school year name is unique (case-insensitive), optionally excluding a specific ID
async def ensure_unique_name(db: SessionDep, name: str, exclude_id: UUID | None = None) -> None:
    stmt = select(SchoolYear).where(func.lower(SchoolYear.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(SchoolYear.id != exclude_id)

    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'School year "{name}" already exists.',
        )

# Helper function to find the internal user ID based on the Clerk user ID from the current_user dict
async def _actor_user_id(db: SessionDep, current_user: dict) -> UUID | None:
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        return None
    stmt = select(User.id).where(User.clerk_user_id == clerk_user_id)
    return (await db.execute(stmt)).scalar_one_or_none()

# Helper function to log an action performed on a school year
async def log_school_year_action(
    db: SessionDep,
    school_year: SchoolYear,
    action: str,
    current_user: dict | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    actor_clerk_user_id = current_user.get("sub") if current_user else None
    if not isinstance(actor_clerk_user_id, str):
        actor_clerk_user_id = None

    db.add(
        AdminAuditLog(
            school_year_id=school_year.id,
            action=action,
            entity_type="school_year",
            actor_user_id=await _actor_user_id(db, current_user or {}),
            actor_clerk_user_id=actor_clerk_user_id,
            previous_values=previous_values,
            new_values=new_values,
        )
    )

# Helper function to compile a summary of a school year's key metrics and readiness for activation
async def _summary_for_school_year(db: SessionDep, school_year: SchoolYear) -> dict[str, object]:
    active_departments_stmt = select(Department).where(Department.is_active.is_(True)).order_by(Department.code.asc())
    active_departments = (await db.execute(active_departments_stmt)).scalars().all()
    active_department_codes = [department.code for department in active_departments]
    active_program_ids = {program_uuid_for_department_code(code) for code in active_department_codes}

    assignments_stmt = select(ProgramAdviserAssignment.program_id).where(
        ProgramAdviserAssignment.school_year_id == school_year.id
    )
    assigned_program_ids = set((await db.execute(assignments_stmt)).scalars().all())
    assigned_active_program_ids = assigned_program_ids.intersection(active_program_ids)
    missing_department_assignments = [
        department.code
        for department in active_departments
        if program_uuid_for_department_code(department.code) not in assigned_program_ids
    ]

    requirement_count_stmt = (
        select(func.count(SchoolYearRequirement.id))
        .join(DocumentType, DocumentType.id == SchoolYearRequirement.document_type_id)
        .where(
            SchoolYearRequirement.school_year_id == school_year.id,
        )
    )
    requirement_count_result = await db.execute(requirement_count_stmt)
    requirement_count_row = requirement_count_result.fetchone()
    raw_count = requirement_count_row[0] if requirement_count_row else 0

    valid_requirements = []
    if raw_count > 0:
        req_stmt = (
            select(SchoolYearRequirement, DocumentType)
            .join(DocumentType, DocumentType.id == SchoolYearRequirement.document_type_id)
            .where(
                SchoolYearRequirement.school_year_id == school_year.id,
            )
        )
        req_result = await db.execute(req_stmt)
        for req_row in req_result.all():
            doc_type = req_row[1]
            classifications = doc_type.applicable_classifications
            if classifications and len(classifications) > 0:
                valid_requirements.append(req_row[0].id)

    requirement_count = len(valid_requirements)

    readiness_issues: list[str] = []
    if school_year.status == SchoolYearStatus.CLOSED:
        readiness_issues.append("School year is closed.")
    if school_year.end_date < school_year.start_date:
        readiness_issues.append("Date range is invalid.")
    if school_year.auto_closure_date and school_year.auto_closure_date < school_year.start_date:
        readiness_issues.append("Auto closure date is earlier than the school year start date.")
    if requirement_count == 0:
        readiness_issues.append("No document requirements configured.")
    if missing_department_assignments:
        readiness_issues.append("Some active departments do not have adviser assignments.")

    return {
        "adviser_assignment_count": len(assigned_active_program_ids),
        "requirement_count": requirement_count,
        "active_department_count": len(active_departments),
        "missing_department_assignments": missing_department_assignments,
        "readiness_issues": readiness_issues,
        "is_ready": len(readiness_issues) == 0,
    }

# Helper function to serialize a SchoolYear model instance into a SchoolYearResponse schema, including summary metrics
async def serialize_school_year(db: SessionDep, school_year: SchoolYear) -> SchoolYearResponse:
    summary = await _summary_for_school_year(db, school_year)
    return SchoolYearResponse(
        id=str(school_year.id),
        name=school_year.name,
        start_date=school_year.start_date,
        end_date=school_year.end_date,
        auto_closure_date=school_year.auto_closure_date,
        status=school_year.status,
        is_active=school_year.is_active,
        created_at=school_year.created_at,
        updated_at=school_year.updated_at,
        **summary,
    )

# Helper function to activate a school year, ensuring that any currently active school year is deactivated first
async def activate_school_year(db: SessionDep, school_year: SchoolYear, current_user: dict | None = None) -> None:
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed school years cannot be activated.",
        )

    stmt = select(SchoolYear).where(
        SchoolYear.is_active.is_(True),
        SchoolYear.id != school_year.id,
    )
    active_rows = (await db.execute(stmt)).scalars().all()
    for active_row in active_rows:
        previous_values = school_year_snapshot(active_row)
        active_row.is_active = False
        if active_row.status == SchoolYearStatus.ACTIVE:
            active_row.status = SchoolYearStatus.UPCOMING
        await log_school_year_action(
            db,
            active_row,
            "deactivate",
            current_user,
            previous_values=previous_values,
            new_values=school_year_snapshot(active_row),
        )

    if active_rows:
        await db.flush()

    previous_values = school_year_snapshot(school_year)
    school_year.is_active = True
    school_year.status = SchoolYearStatus.ACTIVE
    await log_school_year_action(
        db,
        school_year,
        "activate",
        current_user,
        previous_values=previous_values,
        new_values=school_year_snapshot(school_year),
    )

# Helper function to retrieve the latest adviser assignments for a given school year, ordered by most recent update
async def _latest_assignment_rows(db: SessionDep, school_year_id: UUID):
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
    return (await db.execute(assignments_stmt)).all()

# Helper function to build a CSV string containing all school years and their key metrics for export purposes
async def build_school_years_csv(db: SessionDep) -> str:
    school_years = (await db.execute(select(SchoolYear).order_by(desc(SchoolYear.start_date)))).scalars().all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Name",
            "Start Date",
            "End Date",
            "Auto Closure Date",
            "Status",
            "Is Active",
            "Ready",
            "Adviser Assignments",
            "Document Requirements",
            "Missing Department Assignments",
            "Readiness Issues",
        ]
    )
    for school_year in school_years:
        serialized = await serialize_school_year(db, school_year)
        writer.writerow(
            [
                serialized.name,
                serialized.start_date.isoformat(),
                serialized.end_date.isoformat(),
                serialized.auto_closure_date.isoformat() if serialized.auto_closure_date else "",
                serialized.status.value,
                "yes" if serialized.is_active else "no",
                "yes" if serialized.is_ready else "no",
                serialized.adviser_assignment_count,
                serialized.requirement_count,
                "; ".join(serialized.missing_department_assignments),
                "; ".join(serialized.readiness_issues),
            ]
        )

    return output.getvalue()

# Helper function to automatically close any school years that have an auto closure date on or before today, and return a summary of the closed school years
async def run_auto_closure(db: SessionDep, current_user: dict) -> SchoolYearAutoClosureResponse:
    today = date.today()
    stmt = select(SchoolYear).where(
        SchoolYear.auto_closure_date.is_not(None),
        SchoolYear.auto_closure_date <= today,
        SchoolYear.status != SchoolYearStatus.CLOSED,
    )
    due_school_years = (await db.execute(stmt)).scalars().all()
    for school_year in due_school_years:
        previous_values = school_year_snapshot(school_year)
        school_year.status = SchoolYearStatus.CLOSED
        school_year.is_active = False
        await log_school_year_action(
            db,
            school_year,
            "auto-close",
            current_user,
            previous_values=previous_values,
            new_values=school_year_snapshot(school_year),
        )

    await db.commit()
    for school_year in due_school_years:
        await db.refresh(school_year)

    serialized = [await serialize_school_year(db, school_year) for school_year in due_school_years]
    return SchoolYearAutoClosureResponse(closed_school_years=serialized, closed_count=len(serialized))

# Helper function to retrieve a list of all school years, including their key metrics, ordered by active status and start date  
async def list_school_years(db: SessionDep) -> list[SchoolYearResponse]:
    stmt = select(SchoolYear).order_by(
        desc(SchoolYear.is_active),
        desc(SchoolYear.start_date),
        desc(SchoolYear.created_at),
    )
    school_years = (await db.execute(stmt)).scalars().all()
    return [await serialize_school_year(db, school_year) for school_year in school_years]


async def get_active_school_year(db: SessionDep) -> SchoolYearResponse | None:
    stmt = (
        select(SchoolYear)
        .where(SchoolYear.is_active.is_(True))
        .order_by(desc(SchoolYear.updated_at))
    )
    school_year = (await db.execute(stmt)).scalars().first()
    if school_year is None:
        return None
    return await serialize_school_year(db, school_year)

# Helper function to retrieve the adviser assignment status for each department within a given school year, including adviser details if assigned
async def list_school_year_assignments(
    db: SessionDep,
    school_year_id: UUID,
) -> list[SchoolYearDepartmentAssignmentResponse]:
    await get_school_year_or_404(db, school_year_id)
    departments = (await db.execute(select(Department).order_by(Department.code.asc()))).scalars().all()
    assignment_rows = await _latest_assignment_rows(db, school_year_id)

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

# Helper function to provide a preview of the activation status of a school year, including any issues that would prevent activation and how it compares to the currently active school year
async def get_activation_preview(db: SessionDep, school_year_id: UUID) -> SchoolYearActivationPreviewResponse:
    selected = await get_school_year_or_404(db, school_year_id)
    selected_response = await serialize_school_year(db, selected)
    current_active = (
        await db.execute(
            select(SchoolYear)
            .where(SchoolYear.is_active.is_(True))
            .order_by(desc(SchoolYear.updated_at))
        )
    ).scalars().first()
    current_active_response = await serialize_school_year(db, current_active) if current_active else None
    readiness_issues = list(selected_response.readiness_issues)
    if selected.status == SchoolYearStatus.CLOSED and "School year is closed." not in readiness_issues:
        readiness_issues.append("School year is closed.")

    return SchoolYearActivationPreviewResponse(
        selected_school_year=selected_response,
        current_active_school_year=current_active_response,
        will_replace_current_active=current_active is not None and current_active.id != selected.id,
        can_activate=selected.status != SchoolYearStatus.CLOSED,
        readiness_issues=readiness_issues,
        adviser_assignment_count=selected_response.adviser_assignment_count,
        requirement_count=selected_response.requirement_count,
        missing_department_assignments=selected_response.missing_department_assignments,
    )

# Helper function to retrieve a list of audit log entries for a given school year, including details about the actor and the changes made in each action    
async def list_school_year_audit_logs(db: SessionDep, school_year_id: UUID) -> list[AdminAuditLogResponse]:
    await get_school_year_or_404(db, school_year_id)

    stmt = (
        select(AdminAuditLog, User)
        .outerjoin(User, AdminAuditLog.actor_user_id == User.id)
        .where(AdminAuditLog.school_year_id == school_year_id)
        .order_by(desc(AdminAuditLog.created_at))
    )
    try:
        rows = (await db.execute(stmt)).all()
    except ProgrammingError:
        await db.rollback()
        return []
    return [
        AdminAuditLogResponse(
            id=str(log.id),
            school_year_id=str(log.school_year_id),
            action=log.action,
            actor_user_id=str(log.actor_user_id) if log.actor_user_id else None,
            actor_clerk_user_id=log.actor_clerk_user_id,
            actor_name=_build_user_display_name(user, fallback=log.actor_clerk_user_id),
            previous_values=log.previous_values,
            new_values=log.new_values,
            created_at=log.created_at,
        )
        for log, user in rows
    ]

# Helper function to create a new school year with the provided details, ensuring that the name is unique and optionally activating it immediately if requested
async def create_school_year(
    db: SessionDep,
    payload: SchoolYearCreateRequest,
    current_user: dict,
) -> SchoolYearResponse:
    validate_date_range(payload.start_date, payload.end_date, payload.auto_closure_date)
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
        auto_closure_date=payload.auto_closure_date,
        status=payload.status,
        is_active=False,
    )
    db.add(school_year)
    await db.flush()
    await log_school_year_action(db, school_year, "create", current_user, new_values=school_year_snapshot(school_year))

    activate_requested = payload.set_as_active or payload.status == SchoolYearStatus.ACTIVE
    if activate_requested:
        await activate_school_year(db, school_year, current_user)

    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to update the details of an existing school year, ensuring that any changes are valid and logging the updates appropriately
async def update_school_year(
    db: SessionDep,
    school_year_id: UUID,
    payload: SchoolYearUpdateRequest,
    current_user: dict,
) -> SchoolYearResponse:
    school_year = await get_school_year_or_404(db, school_year_id)
    previous_values = school_year_snapshot(school_year)

    if school_year.status == SchoolYearStatus.CLOSED and payload.status != SchoolYearStatus.UPCOMING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed school years must be reopened before they can be edited.",
        )

    if payload.name is not None and payload.name != school_year.name:
        await ensure_unique_name(db, payload.name, exclude_id=school_year.id)
        school_year.name = payload.name

    effective_start = payload.start_date if payload.start_date is not None else school_year.start_date
    effective_end = payload.end_date if payload.end_date is not None else school_year.end_date
    effective_auto_closure = (
        payload.auto_closure_date
        if "auto_closure_date" in payload.model_fields_set
        else school_year.auto_closure_date
    )
    validate_date_range(effective_start, effective_end, effective_auto_closure)

    if payload.start_date is not None:
        school_year.start_date = payload.start_date
    if payload.end_date is not None:
        school_year.end_date = payload.end_date
    if "auto_closure_date" in payload.model_fields_set:
        school_year.auto_closure_date = payload.auto_closure_date

    next_status = payload.status if payload.status is not None else school_year.status
    if next_status == SchoolYearStatus.CLOSED and payload.set_as_active is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A closed school year cannot be set as active.",
        )

    if payload.status is not None:
        school_year.status = payload.status

    if payload.set_as_active is True:
        await activate_school_year(db, school_year, current_user)
    elif payload.set_as_active is False:
        if school_year.is_active:
            school_year.is_active = False
        if school_year.status == SchoolYearStatus.ACTIVE:
            school_year.status = SchoolYearStatus.UPCOMING
        await log_school_year_action(
            db,
            school_year,
            "deactivate",
            current_user,
            previous_values=previous_values,
            new_values=school_year_snapshot(school_year),
        )
    else:
        if next_status == SchoolYearStatus.ACTIVE:
            await activate_school_year(db, school_year, current_user)
        elif next_status in {SchoolYearStatus.UPCOMING, SchoolYearStatus.CLOSED} and school_year.is_active:
            school_year.is_active = False

    await log_school_year_action(
        db,
        school_year,
        "update",
        current_user,
        previous_values=previous_values,
        new_values=school_year_snapshot(school_year),
    )
    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to set a school year as active, ensuring that any currently active school year is deactivated first and that the selected school year is not closed
async def set_school_year_active(db: SessionDep, school_year_id: UUID, current_user: dict) -> SchoolYearResponse:
    school_year = await get_school_year_or_404(db, school_year_id)
    await activate_school_year(db, school_year, current_user)
    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to set a school year as inactive, ensuring that if it is currently active its status is also updated to upcoming
async def close_school_year(db: SessionDep, school_year_id: UUID, current_user: dict) -> SchoolYearResponse:
    school_year = await get_school_year_or_404(db, school_year_id)
    previous_values = school_year_snapshot(school_year)
    school_year.status = SchoolYearStatus.CLOSED
    school_year.is_active = False
    await log_school_year_action(
        db,
        school_year,
        "close",
        current_user,
        previous_values=previous_values,
        new_values=school_year_snapshot(school_year),
    )

    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to reopen a closed school year, changing its status back to upcoming and allowing it to be edited or activated again
async def reopen_school_year(db: SessionDep, school_year_id: UUID, current_user: dict) -> SchoolYearResponse:
    school_year = await get_school_year_or_404(db, school_year_id)
    if school_year.status != SchoolYearStatus.CLOSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only closed school years can be reopened.")

    previous_values = school_year_snapshot(school_year)
    school_year.status = SchoolYearStatus.UPCOMING
    school_year.is_active = False
    await log_school_year_action(
        db,
        school_year,
        "reopen",
        current_user,
        previous_values=previous_values,
        new_values=school_year_snapshot(school_year),
    )

    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to set a school year as inactive, ensuring that if it is currently active its status is also updated to upcoming
async def set_school_year_inactive(db: SessionDep, school_year_id: UUID, current_user: dict) -> SchoolYearResponse:
    school_year = await get_school_year_or_404(db, school_year_id)
    previous_values = school_year_snapshot(school_year)
    school_year.is_active = False
    if school_year.status == SchoolYearStatus.ACTIVE:
        school_year.status = SchoolYearStatus.UPCOMING
    await log_school_year_action(
        db,
        school_year,
        "deactivate",
        current_user,
        previous_values=previous_values,
        new_values=school_year_snapshot(school_year),
    )

    await db.commit()
    await db.refresh(school_year)
    return await serialize_school_year(db, school_year)

# Helper function to create a new school year by copying the details of an existing school year, with options to copy adviser assignments and document requirements, and to set the new school year as active immediately if requested
async def rollover_school_year(
    db: SessionDep,
    school_year_id: UUID,
    payload: SchoolYearRolloverRequest,
    current_user: dict,
) -> SchoolYearResponse:
    source_school_year = await get_school_year_or_404(db, school_year_id)
    validate_date_range(payload.start_date, payload.end_date, payload.auto_closure_date)
    await ensure_unique_name(db, payload.name)

    new_school_year = SchoolYear(
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        auto_closure_date=payload.auto_closure_date,
        status=SchoolYearStatus.UPCOMING,
        is_active=False,
    )
    db.add(new_school_year)
    await db.flush()

    if payload.copy_assignments:
        assignment_rows = await _latest_assignment_rows(db, source_school_year.id)
        copied_program_ids: set[UUID] = set()
        for assignment, _adviser, _user in assignment_rows:
            if assignment.program_id in copied_program_ids:
                continue
            copied_program_ids.add(assignment.program_id)
            db.add(
                ProgramAdviserAssignment(
                    adviser_id=assignment.adviser_id,
                    program_id=assignment.program_id,
                    school_year_id=new_school_year.id,
                )
            )

    if payload.copy_requirements:
        requirement_stmt = select(SchoolYearRequirement.document_type_id).where(
            SchoolYearRequirement.school_year_id == source_school_year.id
        )
        document_type_ids = (await db.execute(requirement_stmt)).scalars().all()
        for document_type_id in document_type_ids:
            db.add(
                SchoolYearRequirement(
                    school_year_id=new_school_year.id,
                    document_type_id=document_type_id,
                )
            )

    await log_school_year_action(
        db,
        new_school_year,
        "rollover",
        current_user,
        previous_values={"source_school_year_id": str(source_school_year.id), "source_name": source_school_year.name},
        new_values={
            **school_year_snapshot(new_school_year),
            "copy_assignments": payload.copy_assignments,
            "copy_requirements": payload.copy_requirements,
        },
    )

    if payload.set_as_active:
        await activate_school_year(db, new_school_year, current_user)

    await db.commit()
    await db.refresh(new_school_year)
    return await serialize_school_year(db, new_school_year)


# ─── Adviser-specific school year listing ─────────────────────────────────────


async def list_adviser_school_years(
    db: SessionDep,
    adviser: Adviser,
) -> list[dict]:
    assignment_stmt = (
        select(ProgramAdviserAssignment.school_year_id)
        .where(ProgramAdviserAssignment.adviser_id == adviser.id)
        .distinct()
    )
    assigned_year_ids = (await db.execute(assignment_stmt)).scalars().all()
    if not assigned_year_ids:
        return []

    stmt = (
        select(SchoolYear)
        .where(SchoolYear.id.in_(assigned_year_ids))
        .order_by(desc(SchoolYear.start_date))
    )
    years = (await db.execute(stmt)).scalars().all()

    return [
        {
            "id": str(y.id),
            "name": y.name,
            "is_current": y.is_active,
        }
        for y in years
    ]
