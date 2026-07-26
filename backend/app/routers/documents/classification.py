import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import attributes, selectinload

from ...database import SessionDep
from ...models import DocumentSubmission, DocumentType, SchoolYearRequirement, Student, SubmissionStatus
from ...services.gcp_storage import delete_file as gcs_delete_file
from ...services.job_queue import create_job, duplicate_check
from ...services.processor import process_submission
from ...services.user_sync import ensure_user_row
from .schemas import StudentClaims, SubmissionDetailResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


class ClassifyAllRequest(BaseModel):
    submission_ids: list[str] | None = None


class ConfirmClassificationRequest(BaseModel):
    document_type_id: str | None = None


@router.post("/api/me/documents/{submission_id}/classify", status_code=202)
async def classify_document(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
):
    """Classify a single document. Delegates to the async job system."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to classify this document.")

    if submission.status not in (SubmissionStatus.UPLOADED, SubmissionStatus.FLAGGED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot classify a document with status '{submission.status.value}'. Only UPLOADED or FLAGGED documents can be classified.",
        )

    # Duplicate check
    existing = await duplicate_check(db, student.id, "classify")
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An active classification job is already in progress.",
        )

    job = await create_job(
        db,
        student_id=student.id,
        operation="classify",
        submission_ids=[submission.id],
        requested_by=user.id,
    )

    return {
        "job_id": str(job.id),
        "operation": job.operation,
        "status": job.status.value if job.status else "",
        "progress": job.progress or 0,
        "total": job.total or 0,
    }


@router.post("/api/me/documents/classify-all", status_code=202)
async def classify_all_documents(
    current_user: StudentClaims,
    db: SessionDep,
    body: ClassifyAllRequest | None = None,
):
    """Classify multiple document submissions. Delegates to the async job system."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    body = body or ClassifyAllRequest()
    eligible_statuses = (
        SubmissionStatus.UPLOADED,
        SubmissionStatus.FLAGGED,
    )

    if body.submission_ids is not None:
        unique_ids: set[UUID] = set()
        for raw_id in body.submission_ids:
            try:
                unique_ids.add(UUID(raw_id))
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid submission id: {raw_id}",
                ) from exc

        if unique_ids:
            result = await db.execute(
                select(DocumentSubmission).where(DocumentSubmission.id.in_(unique_ids))
            )
            submissions = list(result.scalars().all())

            if len(submissions) != len(unique_ids):
                raise HTTPException(status_code=404, detail="One or more documents not found.")

            for submission in submissions:
                if submission.status not in eligible_statuses:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Cannot classify a document with status '{submission.status.value}'. "
                            "Only UPLOADED or FLAGGED documents can be classified."
                        ),
                    )
                if submission.student_id != student.id:
                    raise HTTPException(
                        status_code=403,
                        detail="You do not have permission to classify one or more documents.",
                    )
        else:
            submissions = []
    else:
        result = await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.status.in_(eligible_statuses),
            )
        )
        submissions = list(result.scalars().all())

    if not submissions:
        raise HTTPException(status_code=400, detail="No documents eligible for classification.")

    # Duplicate check
    existing = await duplicate_check(db, student.id, "classify")
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An active classification job is already in progress.",
        )

    job = await create_job(
        db,
        student_id=student.id,
        operation="classify",
        submission_ids=[sub.id for sub in submissions],
        requested_by=user.id,
    )

    return {
        "job_id": str(job.id),
        "operation": job.operation,
        "status": job.status.value if job.status else "",
        "progress": job.progress or 0,
        "total": job.total or 0,
    }


@router.post("/api/me/documents/{submission_id}/confirm", response_model=SubmissionDetailResponse)
async def confirm_classification(
    submission_id: UUID,
    body: ConfirmClassificationRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> SubmissionDetailResponse:
    """Manually confirm/override a classification (synchronous, not an AI operation)."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to confirm this document.")

    if submission.status not in (SubmissionStatus.CLASSIFIED,):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm a document with status '{submission.status.value}'. Only CLASSIFIED documents can be confirmed.",
        )

    if body.document_type_id:
        try:
            dt_uuid = UUID(body.document_type_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_type_id.")
        dt_exists = await db.get(DocumentType, dt_uuid)
        if dt_exists is None:
            raise HTTPException(status_code=404, detail="Document type not found.")
        submission.document_type_id = dt_uuid

    if submission.classification_result and isinstance(submission.classification_result, dict):
        submission.classification_result.pop("flag", None)
        submission.classification_result["accepted_by_user"] = True
        attributes.flag_modified(submission, "classification_result")

    submission.status = SubmissionStatus.CLASSIFIED
    await db.commit()
    await db.refresh(submission)
    await db.refresh(submission, attribute_names=["document_type"])

    return SubmissionDetailResponse(
        id=str(submission.id),
        status=submission.status.value,
        file_key=submission.file_key,
        original_filename=submission.original_filename,
        file_size=submission.file_size,
        mime_type=submission.mime_type,
        is_compiled=submission.is_compiled,
        document_type_id=str(submission.document_type_id) if submission.document_type_id else None,
        document_type_name=submission.document_type.name if submission.document_type else None,
        classification_result=submission.classification_result,
        created_at=submission.created_at.isoformat() if submission.created_at else "",
    )
