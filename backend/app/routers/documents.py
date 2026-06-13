from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException
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
from ..services.s3 import generate_presigned_post as s3_generate_presigned_post
from ..services.s3 import generate_presigned_url as s3_generate_presigned_url
from ..services.s3 import head_object as s3_head_object
from ..services.s3 import make_staging_key
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


class InitiateUploadRequest(BaseModel):
    # Original filename from the client's file picker.
    name: str
    # MIME type reported by the browser (e.g. application/pdf).
    type: str
    # File size in bytes.
    size: int
    # Optional document type selected by the student.
    document_type_id: str | None = None
    # Whether this file is a compiled set of documents that needs splitting.
    is_compiled: bool = False


class InitiateUploadResponse(BaseModel):
    # Database id for the submission record; used in the confirm step.
    submission_id: str
    # Browser must POST the file to this S3 URL.
    url: str
    # Hidden form fields that must accompany the POST (key, policy, signature, etc.).
    fields: dict[str, str]
    # S3 object key for reference.
    key: str


class ConfirmUploadRequest(BaseModel):
    submission_id: str


class ConfirmUploadResponse(BaseModel):
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


class DownloadUrlResponse(BaseModel):
    # Presigned GET URL that the browser can use in an iframe/img src to view the file.
    url: str
    # Number of seconds until the presigned URL expires.
    expires_in: int


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


@router.post("/api/me/documents/initiate", response_model=InitiateUploadResponse)
async def initiate_upload(
    body: InitiateUploadRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> InitiateUploadResponse:
    """Create a PENDING submission and return a presigned POST URL for direct S3 upload.

    The browser uploads the file directly to S3 using the returned URL and fields,
    then calls POST /api/me/documents/confirm to mark the submission as UPLOADED.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found. Complete onboarding first.")

    key = make_staging_key(str(student.id), body.name)
    presigned = s3_generate_presigned_post(key, body.type)

    submission = DocumentSubmission(
        student_id=student.id,
        file_key=key,
        original_filename=body.name,
        mime_type=body.type,
        file_size=str(body.size),
        is_compiled=body.is_compiled,
        status=SubmissionStatus.PENDING,
    )
    if body.document_type_id:
        submission.document_type_id = body.document_type_id

    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return InitiateUploadResponse(
        submission_id=str(submission.id),
        url=presigned["url"],
        fields=presigned["fields"],
        key=key,
    )


class RetryUploadRequest(BaseModel):
    # Updated metadata for the file being re-uploaded. Optional — if omitted,
    # the existing submission metadata is reused.
    name: str | None = None
    type: str | None = None
    size: int | None = None


@router.post("/api/me/documents/{submission_id}/retry", response_model=InitiateUploadResponse)
async def retry_upload(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
    body: RetryUploadRequest | None = None,
) -> InitiateUploadResponse:
    """Generate a fresh presigned POST URL for an existing PENDING submission.

    Used when an upload was initiated but the browser never completed the S3 POST
    (e.g., user closed the tab, network failed). The file_key stays the same;
    only the presigned URL is refreshed so the browser can retry the upload.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to retry this document.")

    if submission.status != SubmissionStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot retry a document with status '{submission.status.value}'. Only PENDING submissions can be retried.",
        )

    # Update metadata if the user selected a different file for retry.
    if body:
        if body.name:
            submission.original_filename = body.name
        if body.type:
            submission.mime_type = body.type
        if body.size is not None:
            submission.file_size = str(body.size)
        if body.name or body.type or body.size is not None:
            await db.commit()
            await db.refresh(submission)

    presigned = s3_generate_presigned_post(
        submission.file_key,
        submission.mime_type or "application/octet-stream",
    )

    return InitiateUploadResponse(
        submission_id=str(submission.id),
        url=presigned["url"],
        fields=presigned["fields"],
        key=submission.file_key,
    )


@router.post("/api/me/documents/confirm", response_model=ConfirmUploadResponse)
async def confirm_upload(
    body: ConfirmUploadRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> ConfirmUploadResponse:
    """Verify the file exists in S3 and mark the submission as UPLOADED.

    This endpoint is called by the browser after it has successfully POSTed the
    file to the presigned S3 URL returned by /api/me/documents/initiate.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    try:
        submission_id = UUID(body.submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid submission id.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to confirm this document.")

    # Verify the object actually arrived in S3 before marking it uploaded.
    # head_object is a synchronous boto3 call, so run it in a thread pool to
    # avoid blocking the FastAPI event loop for other students.
    await asyncio.to_thread(s3_head_object, submission.file_key)

    submission.status = SubmissionStatus.UPLOADED
    await db.commit()
    await db.refresh(submission)

    return ConfirmUploadResponse(
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


@router.get("/api/me/documents/{submission_id}/download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> DownloadUrlResponse:
    """Return a presigned GET URL for viewing a previously uploaded document.

    The URL is only generated for submissions that have actually arrived in S3
    (UPLOADED or FLAGGED). PENDING or PROCESSING submissions are rejected
    because the file may not be present yet.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this document.")

    if submission.status not in (SubmissionStatus.UPLOADED, SubmissionStatus.FLAGGED):
        raise HTTPException(
            status_code=409,
            detail=f"Document is not ready for preview (status: {submission.status.value}).",
        )

    # Presigned URLs expire after one hour by default.
    url = s3_generate_presigned_url(submission.file_key)
    return DownloadUrlResponse(url=url, expires_in=3600)
