from __future__ import annotations

from typing import Any

import io

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi import Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload
from typing_extensions import Annotated

from ..database import SessionDep
from ..models import Adviser, DocumentSubmission, DocumentType, ProgramAdviserAssignment, SchoolYear, SchoolYearRequirement, Student, SubmissionStatus, User, UserRole
from ..rbac import require_roles, require_student
from ..routers.admin.program_assignment import get_program_id_to_department_code_map
from ..services.clerk import update_user_personal_names, update_user_public_metadata
from ..services.document_requirements import get_required_document_types_for_student
from ..services.s3 import upload_file as s3_upload
from ..services.user_sync import ensure_user_row

router = APIRouter()


class PublicMetadataUpdate(BaseModel):
    # These fields are stored in Clerk `publicMetadata` and optionally added to the session token as custom claims.
    student_number: str | None = None
    program: str | None = None


# Strict student-only endpoint: admins should not be able to modify student profile fields.
StudentClaims = Annotated[dict, Depends(require_student)]
AdviserClaims = Annotated[dict, Depends(require_roles(UserRole.ADVISER, allow_admin=False))]


class AdviserProfileResponse(BaseModel):
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    email: str | None
    department: str | None
    school_year: str | None


class AdviserProfileUpdateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_required_name(cls, value: str) -> str:
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


async def _ensure_adviser_profile_row(db: SessionDep, current_user: dict) -> tuple[User, Adviser]:
    user = await ensure_user_row(db, current_user)
    if user.role != UserRole.ADVISER:
        raise HTTPException(status_code=403, detail="Only advisers can access this endpoint.")

    result = await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    adviser = result.scalar_one_or_none()
    if adviser is not None:
        return user, adviser

    adviser = Adviser(user_id=user.id)
    db.add(adviser)
    await db.commit()
    await db.refresh(user)
    await db.refresh(adviser)
    return user, adviser


async def _get_active_assignment_for_adviser(db: SessionDep, adviser_id: Any) -> tuple[str | None, str | None]:
    active_school_year_stmt = (
        select(SchoolYear)
        .where(SchoolYear.is_active.is_(True))
        .order_by(desc(SchoolYear.updated_at))
    )
    active_school_year = (await db.execute(active_school_year_stmt)).scalars().first()
    if active_school_year is None:
        return None, None

    assignment_stmt = (
        select(ProgramAdviserAssignment.program_id)
        .where(
            ProgramAdviserAssignment.adviser_id == adviser_id,
            ProgramAdviserAssignment.school_year_id == active_school_year.id,
        )
        .order_by(
            desc(ProgramAdviserAssignment.updated_at),
            desc(ProgramAdviserAssignment.created_at),
        )
    )
    program_id = (await db.execute(assignment_stmt)).scalars().first()
    if program_id is None:
        return None, active_school_year.name

    program_id_to_code = await get_program_id_to_department_code_map(db)
    return program_id_to_code.get(program_id), active_school_year.name


def _build_adviser_profile_response(
    user: User,
    *,
    department: str | None,
    school_year: str | None,
) -> AdviserProfileResponse:
    return AdviserProfileResponse(
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        email=user.email,
        department=department,
        school_year=school_year,
    )


@router.post("/api/users/public-metadata", tags=["users"])
async def update_public_metadata(payload: PublicMetadataUpdate, current_user: StudentClaims, db: SessionDep) -> dict:
    """
    Stores app-specific data in Clerk publicMetadata, then mirrors it into the DB.

    Security:
    NEED TO SET ROLES FIRST IN THE CLERK DASHBOARD OR VIA ADMIN-ONLY BACKEND FLOW.
    
    """
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(status_code=400, detail="Missing Clerk user id (sub).")

    public_metadata_update: dict[str, Any] = {}
    if payload.student_number is not None:
        public_metadata_update["student_number"] = payload.student_number
    if payload.program is not None:
        public_metadata_update["program"] = payload.program

    updated_public_metadata = await update_user_public_metadata(clerk_user_id, public_metadata_update)
    if updated_public_metadata is None:
        raise HTTPException(status_code=502, detail="Failed to update Clerk publicMetadata.")

    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        # Create the local user row now that Clerk has the publicMetadata.
        user = await ensure_user_row(db, current_user)

    user.public_metadata = updated_public_metadata

    # If the user is a student, keep a 1:1 Student profile row in sync.
    if user.role == UserRole.STUDENT:
        student_number = updated_public_metadata.get("student_number")
        program = updated_public_metadata.get("program")
        result = await db.execute(select(Student).where(Student.user_id == user.id))
        student = result.scalar_one_or_none()
        if student is None:
            student = Student(user_id=user.id)
            db.add(student)

        if isinstance(student_number, str) and student_number:
            student.student_number = student_number
        if isinstance(program, str) and program:
            student.program = program

    await db.commit()
    await db.refresh(user)

    return {
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "role": user.role.value,
        "public_metadata": user.public_metadata,
    }


@router.get("/api/adviser/profile", response_model=AdviserProfileResponse, tags=["users"])
async def get_adviser_profile(current_user: AdviserClaims, db: SessionDep) -> AdviserProfileResponse:
    user, adviser = await _ensure_adviser_profile_row(db, current_user)
    department, school_year = await _get_active_assignment_for_adviser(db, adviser.id)
    return _build_adviser_profile_response(user, department=department, school_year=school_year)


@router.patch("/api/adviser/profile", response_model=AdviserProfileResponse, tags=["users"])
async def update_adviser_profile(
    payload: AdviserProfileUpdateRequest,
    current_user: AdviserClaims,
    db: SessionDep,
) -> AdviserProfileResponse:
    user, adviser = await _ensure_adviser_profile_row(db, current_user)

    updated_names = await update_user_personal_names(
        user.clerk_user_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
    )
    if updated_names is None:
        raise HTTPException(
            status_code=502,
            detail="Failed to update Clerk personal name fields.",
        )

    updated_public_metadata = await update_user_public_metadata(
        user.clerk_user_id,
        {"middle_name": payload.middle_name},
    )
    if updated_public_metadata is None:
        raise HTTPException(status_code=502, detail="Failed to update Clerk publicMetadata.")

    user.first_name = updated_names[0] or payload.first_name
    user.middle_name = payload.middle_name
    user.last_name = updated_names[1] or payload.last_name
    user.public_metadata = updated_public_metadata

    await db.commit()
    await db.refresh(user)

    department, school_year = await _get_active_assignment_for_adviser(db, adviser.id)
    return _build_adviser_profile_response(user, department=department, school_year=school_year)


class RequiredDocumentResponse(BaseModel):
    id: str
    name: str
    code: str
    description: str
    is_required: bool = True


class RequiredDocumentsResponse(BaseModel):
    school_year_id: str | None
    school_year_name: str | None
    auto_closure_date: str | None
    classification: str | None
    documents: list[RequiredDocumentResponse]


@router.get("/api/me/required-documents", response_model=RequiredDocumentsResponse, tags=["users"])
async def get_required_documents(current_user: dict = Depends(require_student), db: SessionDep = None) -> RequiredDocumentsResponse:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()

    if student is None or student.school_year_id is None:
        return RequiredDocumentsResponse(
            school_year_id=None,
            school_year_name=None,
            classification=student.classification.value if student and student.classification else None,
            documents=[],
        )

    school_year = await db.get(SchoolYear, student.school_year_id)
    document_types = await get_required_document_types_for_student(db, student)

    return RequiredDocumentsResponse(
        school_year_id=str(student.school_year_id),
        school_year_name=school_year.name if school_year else None,
        auto_closure_date=str(school_year.auto_closure_date) if school_year and school_year.auto_closure_date else None,
        classification=student.classification.value if student.classification else None,
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


class DocumentUploadResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    is_compiled: bool


@router.post("/api/me/documents/upload", response_model=DocumentUploadResponse, tags=["users"])
async def upload_document(
    file: UploadFile,
    current_user: StudentClaims,
    db: SessionDep,
    is_compiled: bool = False,
    document_type_id: str | None = None,
) -> DocumentUploadResponse:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found. Complete onboarding first.")

    content = await file.read()
    s3_result = s3_upload(io.BytesIO(content), str(student.id), file.filename or "document.pdf")
    submission = DocumentSubmission(
        student_id=student.id,
        file_key=s3_result["key"],
        original_filename=file.filename or "document.pdf",
        mime_type=file.content_type or "application/octet-stream",
        is_compiled=is_compiled,
        status=SubmissionStatus.UPLOADED,
    )
    if document_type_id:
        submission.document_type_id = document_type_id
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return DocumentUploadResponse(
        id=str(submission.id),
        status=submission.status.value,
        file_key=submission.file_key,
        original_filename=submission.original_filename,
        is_compiled=submission.is_compiled,
    )


class SubmissionDetailResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    file_size: str | None = None
    mime_type: str | None = None
    is_compiled: bool
    document_type_name: str | None = None
    created_at: str


@router.get("/api/me/documents", response_model=list[SubmissionDetailResponse], tags=["users"])
async def list_my_documents(
    current_user: StudentClaims,
    db: SessionDep,
) -> list[SubmissionDetailResponse]:
    """Return all document submissions for the current student."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        return []

    db_result = await db.execute(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .where(DocumentSubmission.student_id == student.id)
        .order_by(desc(DocumentSubmission.created_at))
    )
    submissions = db_result.scalars().all()

    return [
        SubmissionDetailResponse(
            id=str(s.id),
            status=s.status.value,
            file_key=s.file_key,
            original_filename=s.original_filename,
            file_size=s.file_size,
            mime_type=s.mime_type,
            is_compiled=s.is_compiled,
            document_type_name=s.document_type.name if s.document_type else None,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s in submissions
    ]
