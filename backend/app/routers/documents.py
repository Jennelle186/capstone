from __future__ import annotations

import asyncio
import json
from uuid import UUID

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import attributes, selectinload
from typing_extensions import Annotated

from ..database import AsyncSessionLocal, SessionDep
from ..models import (
    DocumentSubmission,
    DocumentType,
    ExtractionSchema,
    ExtractionSchemaStatus,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from ..rbac import require_student
from ..services.aws_pipeline import _extract_text, _get_s3_bucket, extract_document_fields, get_raw_kie_pairs
from ..services.document_requirements import get_required_document_types_for_student
from ..services.s3 import delete_file as s3_delete_file
from ..services.s3 import generate_presigned_post as s3_generate_presigned_post
from ..services.s3 import generate_presigned_url as s3_generate_presigned_url
from ..services.s3 import head_object as s3_head_object
from ..services.s3 import make_staging_key
from ..services.processor import process_submission
from ..services.user_sync import ensure_user_row

router: APIRouter = APIRouter(tags=["documents"])

logger = logging.getLogger(__name__)

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
    document_type_id: str | None = None
    document_type_name: str | None = None
    document_type_code: str | None = None
    classification_result: dict | None = None
    extracted_data: dict | None = None
    llama_job_id: str | None = None
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
            document_type_id=str(s.document_type_id) if s.document_type_id else None,
            document_type_name=s.document_type.name if s.document_type else None,
            classification_result=s.classification_result,
            extracted_data=s.extracted_data,
            document_type_code=s.document_type.code if s.document_type else None,
            llama_job_id=s.llama_job_id,
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


@router.post("/api/me/documents/{submission_id}/classify", response_model=SubmissionDetailResponse)
async def classify_document(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> SubmissionDetailResponse:
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

    await process_submission(submission.id)

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
        llama_job_id=submission.llama_job_id,
        created_at=submission.created_at.isoformat() if submission.created_at else "",
    )


class ClassifyAllRequest(BaseModel):
    submission_ids: list[str] | None = None


@router.post("/api/me/documents/classify-all", response_model=list[SubmissionDetailResponse])
async def classify_all_documents(
    current_user: StudentClaims,
    db: SessionDep,
    body: ClassifyAllRequest | None = None,
) -> list[SubmissionDetailResponse]:
    """Classify multiple document submissions for the current student.

    If `submission_ids` is provided, only those submissions are classified after
    verifying ownership and eligibility. If omitted, every eligible submission
    belonging to the student is classified.
    """
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
                if submission.student_id != student.id:
                    raise HTTPException(
                        status_code=403,
                        detail="You do not have permission to classify one or more documents.",
                    )
                    if submission.status not in eligible_statuses:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Cannot classify a document with status '{submission.status.value}'. "
                                "Only UPLOADED or FLAGGED documents can be classified."
                            ),
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

    if submissions:
        await db.commit()

    semaphore = asyncio.Semaphore(3)

    async def _process_one(submission_id: UUID) -> None:
        async with semaphore:
            await process_submission(submission_id)

    await asyncio.gather(
        *(_process_one(submission.id) for submission in submissions),
        return_exceptions=True,
    )

    if submissions:
        result = await db.execute(
            select(DocumentSubmission)
            .options(selectinload(DocumentSubmission.document_type))
            .where(DocumentSubmission.id.in_([submission.id for submission in submissions]))
        )
        updated_submissions = list(result.scalars().all())
    else:
        updated_submissions = []

    return [
        SubmissionDetailResponse(
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
            extracted_data=submission.extracted_data,
            document_type_code=submission.document_type.code if submission.document_type else None,
            llama_job_id=submission.llama_job_id,
            created_at=submission.created_at.isoformat() if submission.created_at else "",
        )
        for submission in updated_submissions
    ]


# ── Extraction endpoints ──────────────────────────────────────────────────────


class ExtractionFieldResponse(BaseModel):
    id: str
    key: str
    type: str = "string"
    description: str = ""
    required: bool = False
    value: str = ""
    source_key: str | None = None
    confidence: float = 0.0
    needs_review: bool = True


class ExtractionItemResponse(BaseModel):
    submission_id: str
    file_name: str
    document_type_name: str | None = None
    document_type_code: str | None = None
    status: str
    fields: list[ExtractionFieldResponse]
    ocr_text: str = ""
    raw_kie: dict[str, str] = {}


class ExtractAllRequest(BaseModel):
    submission_ids: list[str] | None = None


async def _run_extractions_background(
    submission_ids: list[UUID],
    school_year_id: UUID | None,
) -> None:
    """Background task: run KIE extraction for classified submissions."""
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(DocumentSubmission)
                .options(selectinload(DocumentSubmission.document_type))
                .where(DocumentSubmission.id.in_(submission_ids))
            )
            submissions = list(result.scalars().all())
            if not submissions:
                return

            schemas_by_type: dict[UUID, ExtractionSchema] = {}
            if school_year_id:
                req_result = await db.execute(
                    select(SchoolYearRequirement).where(
                        SchoolYearRequirement.school_year_id == school_year_id,
                        SchoolYearRequirement.extraction_schema_id.isnot(None),
                    )
                )
                requirements = list(req_result.scalars().all())
                schema_ids = {r.extraction_schema_id for r in requirements if r.extraction_schema_id}
                if schema_ids:
                    schema_result = await db.execute(
                        select(ExtractionSchema).where(
                            ExtractionSchema.id.in_(schema_ids),
                            ExtractionSchema.status != ExtractionSchemaStatus.ARCHIVED,
                        )
                    )
                    all_schemas = {s.id: s for s in schema_result.scalars().all()}
                    for req in requirements:
                        if req.document_type_id and req.extraction_schema_id and req.extraction_schema_id in all_schemas:
                            schemas_by_type[req.document_type_id] = all_schemas[req.extraction_schema_id]

            semaphore = asyncio.Semaphore(3)

            async def _extract_one(sub: DocumentSubmission) -> None:
                async with semaphore:
                    schema = schemas_by_type.get(sub.document_type_id)
                    if schema is None or not schema.fields_json:
                        return
                    try:
                        extracted = await asyncio.to_thread(
                            extract_document_fields,
                            sub.file_key,
                            schema.fields_json,
                        )
                        if isinstance(extracted, dict):
                            try:
                                bucket = _get_s3_bucket()
                                raw_text, _ = _extract_text(bucket, sub.file_key)
                                extracted["_ocr_text"] = raw_text
                            except Exception:
                                pass
                        sub.extracted_data = extracted
                        sub.status = SubmissionStatus.CLASSIFIED
                    except Exception as exc:
                        logger.exception("Extraction failed for submission %s: %s", sub.id, exc)
                        if sub.classification_result is None or not isinstance(sub.classification_result, dict):
                            sub.classification_result = {}
                        sub.classification_result["extraction_error"] = str(exc)
                        sub.status = SubmissionStatus.FLAGGED

            await asyncio.gather(*(_extract_one(sub) for sub in submissions), return_exceptions=True)
            await db.commit()
        except Exception as exc:
            logger.exception("Extraction background task failed: %s", exc)


@router.post("/api/me/documents/extract-all", response_model=list[SubmissionDetailResponse])
async def extract_all_documents(
    current_user: StudentClaims,
    db: SessionDep,
    background_tasks: BackgroundTasks,
    body: ExtractAllRequest | None = None,
) -> list[SubmissionDetailResponse]:
    """Trigger KIE extraction for classified document submissions.

    Validates ownership and eligibility synchronously, sets status to
    PROCESSING, then schedules extraction in a background task.
    Returns immediately so the frontend does not block.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    body = body or ExtractAllRequest()
    eligible_statuses = (SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED, SubmissionStatus.UPLOADED)

    if body.submission_ids is not None:
        unique_ids: set[UUID] = set()
        for raw_id in body.submission_ids:
            try:
                unique_ids.add(UUID(raw_id))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"Invalid submission id: {raw_id}") from exc

        if unique_ids:
            result = await db.execute(
                select(DocumentSubmission).where(DocumentSubmission.id.in_(unique_ids))
            )
            submissions = list(result.scalars().all())

            if len(submissions) != len(unique_ids):
                raise HTTPException(status_code=404, detail="One or more documents not found.")

            for sub in submissions:
                if sub.student_id != student.id:
                    raise HTTPException(status_code=403, detail="You do not have permission to extract one or more documents.")
                if sub.status not in eligible_statuses:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Cannot extract a document with status '{sub.status.value}'.",
                    )
        else:
            submissions = []
    else:
        result = await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.status.in_(eligible_statuses),
                DocumentSubmission.document_type_id.isnot(None),
            )
        )
        submissions = list(result.scalars().all())

    if not submissions:
        return []

    submission_ids = [sub.id for sub in submissions]
    for sub in submissions:
        sub.status = SubmissionStatus.PROCESSING
    await db.commit()

    background_tasks.add_task(_run_extractions_background, submission_ids, student.school_year_id)

    return [
        SubmissionDetailResponse(
            id=str(sub.id),
            status=sub.status.value,
            file_key=sub.file_key,
            original_filename=sub.original_filename,
            file_size=sub.file_size,
            mime_type=sub.mime_type,
            is_compiled=sub.is_compiled,
            document_type_id=str(sub.document_type_id) if sub.document_type_id else None,
            document_type_name=None,
            classification_result=sub.classification_result,
            extracted_data=sub.extracted_data,
            document_type_code=None,
            llama_job_id=sub.llama_job_id,
            created_at=sub.created_at.isoformat() if sub.created_at else "",
        )
        for sub in submissions
    ]


@router.get("/api/me/documents/extractions", response_model=list[ExtractionItemResponse])
async def list_extractions(
    current_user: StudentClaims,
    db: SessionDep,
) -> list[ExtractionItemResponse]:
    """Return extraction data for classified submissions with extraction schemas.

    For each classified submission belonging to the student, if the document
    type has an active extraction schema, the schema fields are merged with
    any existing extracted_data values and returned.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        return []

    submissions_result = await db.execute(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_((SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED)),
            DocumentSubmission.document_type_id.isnot(None),
        )
    )
    submissions = list(submissions_result.scalars().all())

    if not submissions:
        return []

    # Fetch extraction schemas for the student's school year
    schemas_by_type: dict[UUID, ExtractionSchema] = {}
    if student.school_year_id:
        req_result = await db.execute(
            select(SchoolYearRequirement)
            .options(selectinload(SchoolYearRequirement.extraction_schema))
            .where(
                SchoolYearRequirement.school_year_id == student.school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
        for req in req_result.scalars().all():
            if req.document_type_id and req.extraction_schema and req.extraction_schema.status != ExtractionSchemaStatus.ARCHIVED:
                schemas_by_type[req.document_type_id] = req.extraction_schema

    items: list[ExtractionItemResponse] = []
    for sub in submissions:
        schema = schemas_by_type.get(sub.document_type_id)
        if schema is None:
            continue

        extracted = sub.extracted_data or {}
        ocr_text = extracted.get("_ocr_text", "") if isinstance(extracted, dict) else ""
        raw_kie_data: dict[str, str] = {}
        if isinstance(extracted, dict):
            raw_entry = extracted.get("_raw_kie_pairs", {})
            if isinstance(raw_entry, dict):
                raw_json = raw_entry.get("value", "")
                if raw_json:
                    try:
                        parsed = json.loads(raw_json)
                        if isinstance(parsed, dict):
                            raw_kie_data = parsed
                    except (json.JSONDecodeError, TypeError):
                        pass
        fields: list[ExtractionFieldResponse] = []
        for field_def in (schema.fields_json or []):
            field_id = field_def.get("id", "")
            existing = extracted.get(field_id, {}) if isinstance(extracted, dict) else {}
            if isinstance(existing, str):
                value = existing
                needs_review = False
                confidence = 1.0
                source_key = None
            elif isinstance(existing, dict):
                value = existing.get("value", "")
                needs_review = existing.get("needs_review", True)
                confidence = existing.get("confidence", 0.0)
                source_key = existing.get("source_key")
            else:
                value = str(existing) if existing else ""
                needs_review = True
                confidence = 0.0
                source_key = None

            fields.append(ExtractionFieldResponse(
                id=field_id,
                key=field_def.get("key", ""),
                type=field_def.get("type", "string"),
                description=field_def.get("description", ""),
                required=field_def.get("required", False),
                value=value,
                source_key=source_key,
                confidence=confidence,
                needs_review=needs_review,
            ))

        if fields:
            items.append(ExtractionItemResponse(
                submission_id=str(sub.id),
                file_name=sub.original_filename,
                document_type_name=sub.document_type.name if sub.document_type else None,
                document_type_code=sub.document_type.code if sub.document_type else None,
                status=sub.status.value,
                fields=fields,
                ocr_text=ocr_text,
                raw_kie=raw_kie_data,
            ))

    return items


class ConfirmClassificationRequest(BaseModel):
    document_type_id: str | None = None


@router.post("/api/me/documents/{submission_id}/confirm", response_model=SubmissionDetailResponse)
async def confirm_classification(
    submission_id: UUID,
    body: ConfirmClassificationRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> SubmissionDetailResponse:
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

    if submission.status not in (SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot confirm a document with status '{submission.status.value}'. Only CLASSIFIED or FLAGGED documents can be confirmed.",
        )

    if body.document_type_id:
        try:
            dt_uuid = UUID(body.document_type_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_type_id.")
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
        llama_job_id=submission.llama_job_id,
        created_at=submission.created_at.isoformat() if submission.created_at else "",
    )


@router.get("/api/me/documents/{submission_id}/download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> DownloadUrlResponse:
    """Return a presigned GET URL for viewing a previously uploaded document.

    The URL is only generated for submissions that have actually arrived in S3
    (UPLOADED, FLAGGED, or CLASSIFIED). PENDING or PROCESSING submissions are rejected
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

    if submission.status not in (SubmissionStatus.UPLOADED, SubmissionStatus.FLAGGED, SubmissionStatus.CLASSIFIED, SubmissionStatus.PROCESSING):
        raise HTTPException(
            status_code=409,
            detail=f"Document is not ready for preview (status: {submission.status.value}).",
        )

    # Presigned URLs expire after one hour by default.
    url = s3_generate_presigned_url(submission.file_key)
    return DownloadUrlResponse(url=url, expires_in=3600)
