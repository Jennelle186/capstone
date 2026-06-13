from __future__ import annotations

import io
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload
from typing_extensions import Annotated

from ..database import SessionDep
from ..models import DocumentSubmission, SchoolYear, Student, SubmissionStatus
from ..rbac import require_student
from ..services.document_requirements import get_required_document_types_for_student
from ..services.s3 import delete_file as s3_delete_file
from ..services.s3 import upload_file as s3_upload
from ..services.user_sync import ensure_user_row

router: APIRouter = APIRouter(tags=["documents"])

StudentClaims = Annotated[dict, Depends(require_student)]


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


class DocumentUploadResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    is_compiled: bool


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


@router.post("/api/me/documents/upload", response_model=DocumentUploadResponse)
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


@router.get("/api/me/documents", response_model=list[SubmissionDetailResponse])
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


# DELETE /api/me/documents/{submission_id}
# Deletes a document submission from both the database and S3 storage.
# Only allows deletion of non-verified documents (uploaded, processing, flagged, etc.).
# Verified documents are protected from deletion to preserve audit integrity.
@router.delete("/api/me/documents/{submission_id}")
async def delete_document(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    # Fetch the submission and verify it belongs to the current student
    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this document.")

    # Block deletion of verified documents — they are part of the audit trail
    if submission.status == SubmissionStatus.VERIFIED:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a verified document.",
        )

    # Remove the file from S3 before deleting the database record
    s3_delete_file(submission.file_key)

    await db.delete(submission)
    await db.commit()

    return {"ok": True}
