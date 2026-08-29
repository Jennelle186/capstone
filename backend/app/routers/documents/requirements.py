import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select

from ...database import SessionDep
from ...models import Adviser, Department, ProgramAdviserAssignment, SchoolYear, Student, StudentClassification, User
from ...services.helpers import program_uuid_for_department_code
from ...services.document_requirements import get_required_document_types_for_student
from ...services.students import _resolve_department
from ...services.user_sync import ensure_user_row
from .schemas import StudentClaims

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


class RequiredDocumentResponse(BaseModel):
    id: str
    name: str
    code: str
    description: str
    is_required: bool = True


class RequiredDocumentsResponse(BaseModel):
    school_year_id: str | None
    school_year_name: str | None
    school_year_status: str | None
    auto_closure_date: str | None
    classification: str | None
    classification_set_by_user: bool = False
    documents: list[RequiredDocumentResponse]


@router.get("/api/me/required-documents", response_model=RequiredDocumentsResponse)
async def get_required_documents(
    current_user: StudentClaims,
    db: SessionDep,
) -> RequiredDocumentsResponse:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()

    if student is None or student.school_year_id is None:
        return RequiredDocumentsResponse(
            school_year_id=None,
            school_year_name=None,
            school_year_status=None,
            auto_closure_date=None,
            classification=student.classification.value if student and student.classification else None,
            classification_set_by_user=bool(student.classification_set_by_user) if student else False,
            documents=[],
        )

    school_year = await db.get(SchoolYear, student.school_year_id)
    document_types = await get_required_document_types_for_student(db, student)

    return RequiredDocumentsResponse(
        school_year_id=str(student.school_year_id),
        school_year_name=school_year.name if school_year else None,
        school_year_status=school_year.status.value if school_year else None,
        auto_closure_date=str(school_year.auto_closure_date) if school_year and school_year.auto_closure_date else None,
        classification=student.classification.value if student.classification else None,
        classification_set_by_user=bool(student.classification_set_by_user),
        documents=[
            RequiredDocumentResponse(
                id=str(dt.id),
                name=dt.name,
                code=dt.code,
                description=dt.description,
            )
            for dt in document_types
        ],
    )


class DepartmentResponse(BaseModel):
    id: str
    code: str
    name: str


@router.get("/api/me/departments", response_model=list[DepartmentResponse])
async def list_departments(
    current_user: StudentClaims,
    db: SessionDep,
) -> list[DepartmentResponse]:
    stmt = select(Department).where(Department.is_active == True).order_by(Department.code)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        DepartmentResponse(id=str(r.id), code=r.code, name=r.name)
        for r in rows
    ]


class ProgramUpdateRequest(BaseModel):
    program_id: str


@router.patch("/api/me/program")
async def update_program(
    body: ProgramUpdateRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(400, "Student profile not found.")
    if student.program_id is not None:
        raise HTTPException(409, "Program is locked. Contact admin to change.")
    dept = await db.get(Department, UUID(body.program_id))
    if dept is None or not dept.is_active:
        raise HTTPException(400, "Invalid or inactive department.")
    student.program_id = dept.id
    await db.commit()
    return {"program_id": str(student.program_id)}


class ProgramMismatchResolveRequest(BaseModel):
    action: str
    program_id: str | None = None


@router.post("/api/me/program/resolve-mismatch")
async def resolve_program_mismatch(
    body: ProgramMismatchResolveRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    """Resolve a program mismatch flagged during admission form sync.

    ``action`` is one of:

    - ``confirm_extracted`` — accept the extracted program (``program_id`` may
      be provided to override the stored extracted value, e.g. for an
      unrecognized program where the student picks from a dropdown).
    - ``keep_current`` — keep the current program and clear the mismatch flags.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(404, "Student profile not found.")

    if not student.program_mismatch_pending:
        raise HTTPException(409, "No program mismatch is pending resolution.")

    if body.action == "keep_current":
        student.program_mismatch_pending = False
        student.program_mismatch_extracted = None
        await db.commit()
        return {
            "program_id": str(student.program_id) if student.program_id else None,
            "mismatch_resolved": True,
            "action": "keep_current",
        }

    if body.action == "confirm_extracted":
        if body.program_id:
            dept = await db.get(Department, UUID(body.program_id))
            if dept is None or not dept.is_active:
                raise HTTPException(400, "Invalid or inactive department.")
            new_program_id = dept.id
        else:
            if not student.program_mismatch_extracted:
                raise HTTPException(400, "No extracted program value to confirm.")
            dept = await _resolve_department(db, student.program_mismatch_extracted)
            if dept is None:
                raise HTTPException(
                    400,
                    "Extracted program could not be recognized. Please select a program.",
                )
            new_program_id = dept.id

        student.program_id = new_program_id
        student.program_mismatch_pending = False
        student.program_mismatch_extracted = None
        await db.commit()
        return {
            "program_id": str(student.program_id),
            "mismatch_resolved": True,
            "action": "confirm_extracted",
        }

    raise HTTPException(400, f"Invalid action: {body.action}")


class ClassificationUpdateRequest(BaseModel):
    classification: str


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


class AdviserResponse(BaseModel):
    adviser_name: str | None
    adviser_email: str | None
    department_code: str | None
    department_name: str | None


@router.get("/api/me/adviser", response_model=AdviserResponse | None)
async def get_my_adviser(
    current_user: StudentClaims,
    db: SessionDep,
) -> AdviserResponse | None:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None or student.program_id is None or student.school_year_id is None:
        return None

    dept = await db.get(Department, student.program_id)
    if dept is None:
        return None

    program_id = program_uuid_for_department_code(dept.code)

    stmt = (
        select(User.first_name, User.last_name, User.email)
        .select_from(ProgramAdviserAssignment)
        .join(Adviser, ProgramAdviserAssignment.adviser_id == Adviser.id)
        .join(User, Adviser.user_id == User.id)
        .where(
            ProgramAdviserAssignment.program_id == program_id,
            ProgramAdviserAssignment.school_year_id == student.school_year_id,
        )
        .order_by(desc(ProgramAdviserAssignment.updated_at), desc(ProgramAdviserAssignment.created_at))
    )
    row = (await db.execute(stmt)).first()

    if row is None:
        return AdviserResponse(
            adviser_name=None,
            adviser_email=None,
            department_code=dept.code,
            department_name=dept.name,
        )

    return AdviserResponse(
        adviser_name=f"{row.first_name} {row.last_name}" if row.first_name else row.last_name,
        adviser_email=row.email,
        department_code=dept.code,
        department_name=dept.name,
    )
