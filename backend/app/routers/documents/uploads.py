import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload

from ...database import SessionDep
from ...models import DocumentSubmission, Student, SubmissionStatus
from ...services.gcp_storage import (
    delete_file as gcs_delete_file,
    generate_presigned_post as gcs_generate_presigned_post,
    generate_presigned_url as gcs_generate_presigned_url,
    head_object as gcs_head_object,
    make_staging_key,
)
from ...services.user_sync import ensure_user_row
from .schemas import StudentClaims, SubmissionDetailResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


class InitiateUploadRequest(BaseModel):
    name: str
    type: str
    size: int
    document_type_id: str | None = None
    is_compiled: bool = False


class InitiateUploadResponse(BaseModel):
    submission_id: str
    url: str
    fields: dict[str, str]
    key: str


class ConfirmUploadRequest(BaseModel):
    submission_id: str


class ConfirmUploadResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    is_compiled: bool


class RetryUploadRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    size: int | None = None


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


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

    if body.document_type_id:
        existing = await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.document_type_id == body.document_type_id,
                DocumentSubmission.status.in_([
                    SubmissionStatus.SUBMITTED,
                    SubmissionStatus.IN_REVIEW,
                ]),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail="You cannot submit the same document; please wait for confirmation by your adviser.",
            )

    key = make_staging_key(str(student.id), body.name)
    presigned = gcs_generate_presigned_post(key, body.type)

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

    presigned = gcs_generate_presigned_post(
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
    Classification is triggered separately via the /classify endpoint.
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

    await asyncio.to_thread(gcs_head_object, submission.file_key)

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
            document_type_id=str(s.document_type_id) if s.document_type_id else None,
            document_type_name=s.document_type.name if s.document_type else None,
            classification_result=s.classification_result,
            extracted_data=s.extracted_data,
            document_type_code=s.document_type.code if s.document_type else None,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s in submissions
    ]


@router.post("/api/me/documents/submit-batch")
async def submit_batch(
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    """Advance all classified/flagged submissions to SUBMITTED status.

    Called from the Step 4 review screen when the student clicks
    "Submit All Documents". Locks the documents so they cannot be
    edited or re-uploaded while the adviser reviews them.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    result = await db.execute(
        select(DocumentSubmission).where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_([
                SubmissionStatus.CLASSIFIED,
                SubmissionStatus.FLAGGED,
            ]),
        )
    )
    submissions = result.scalars().all()

    if not submissions:
        raise HTTPException(
            status_code=400,
            detail="No documents ready for submission.",
        )

    for sub in submissions:
        sub.status = SubmissionStatus.SUBMITTED

    await db.commit()

    return {"status": "success", "submitted_count": len(submissions)}


@router.delete("/api/me/documents/{submission_id}")
async def delete_document(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    """Delete a document submission from both the database and S3 storage.

    Only allows deletion of non-verified documents (uploaded, processing, flagged, etc.).
    Verified documents are protected from deletion to preserve audit integrity.
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
        raise HTTPException(status_code=403, detail="You do not have permission to delete this document.")

    if submission.status in (
        SubmissionStatus.VERIFIED,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a document that has been submitted or verified.",
        )

    gcs_delete_file(submission.file_key)

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
    (UPLOADED, FLAGGED, CLASSIFIED, PROCESSING, SUBMITTED, or IN_REVIEW). PENDING
    submissions are rejected because the file may not be present yet.
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

    if submission.status not in (
        SubmissionStatus.UPLOADED,
        SubmissionStatus.FLAGGED,
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.PROCESSING,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Document is not ready for preview (status: {submission.status.value}).",
        )

    url = gcs_generate_presigned_url(submission.file_key)
    return DownloadUrlResponse(url=url, expires_in=3600)
