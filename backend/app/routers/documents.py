from __future__ import annotations

import asyncio
from uuid import UUID

import logging

from fastapi import APIRouter, HTTPException
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
from ..services.document_requirements import get_required_document_types_for_student
from ..services.gcp_pipeline import GcpPipelineError, extract_fields_from_document
from ..services.gcp_storage import (
    delete_file as gcs_delete_file,
    generate_presigned_post as gcs_generate_presigned_post,
    generate_presigned_url as gcs_generate_presigned_url,
    head_object as gcs_head_object,
    make_staging_key,
)
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

    # Verify the object actually arrived in S3 before marking it uploaded.
    # head_object is a synchronous GCS call, so run it in a thread pool to
    # avoid blocking the FastAPI event loop for other students.
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

    # Remove the file from GCS before deleting the database record
    gcs_delete_file(submission.file_key)

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

    if submissions:
        await db.commit()

    for submission in submissions:
        try:
            await process_submission(submission.id)
        except Exception:
            logger.exception("classify_all: submission %s failed", submission.id)
        await asyncio.sleep(2)

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
    ui_component: str | None = None
    options: list[dict[str, str]] | None = None
    section_id: str | None = None
    section_title: str | None = None
    hierarchy_level: int = 1
    parent_field_id: str | None = None


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


async def _extract_single(
    submission_id: UUID,
    field_defs: list,
) -> None:
    """Extract fields from a single submission via Gemini.
    Each call uses its own isolated session so concurrent execution
    does not share SQLAlchemy identity maps.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DocumentSubmission).where(DocumentSubmission.id == submission_id)
        )
        submission = result.scalar_one_or_none()
        if not submission:
            return

        try:
            logger.info("Extracting %d fields from %s via Gemini", len(field_defs), submission.file_key)

            extracted = await asyncio.to_thread(
                extract_fields_from_document,
                submission.file_key,
                field_defs,
            )

            existing = dict(submission.extracted_data or {}) if isinstance(submission.extracted_data, dict) else {}

            for field_def in field_defs:
                field_key = field_def.get("key", "")
                field_id = field_def.get("id", "")
                gemini_result = extracted.get(field_key, {})
                if isinstance(gemini_result, dict):
                    value = str(gemini_result.get("value", "") or "")
                    confidence = gemini_result.get("confidence", 0.0)
                else:
                    value = str(gemini_result) if gemini_result else ""
                    confidence = 0.0

                options = field_def.get("options") or []
                if options:
                    matched = next(
                        (o["value"] for o in options if o.get("label", "").lower() == value.lower()),
                        next(
                            (o["value"] for o in options if o.get("value", "").lower() == value.lower()),
                            None,
                        ),
                    )
                    if matched:
                        value = matched

                if field_def.get("ui_component") == "date_picker" and value and "/" in value:
                    parts = value.split("/")
                    if len(parts) == 3 and len(parts[2]) == 4:
                        value = f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"

                existing[field_id] = {
                    "value": value,
                    "confidence": confidence,
                    "needs_review": confidence < 0.7 if field_def.get("required", True) else False,
                    "source_key": field_key,
                }

            existing["_ocr_text"] = ""
            existing["_raw_kie_pairs"] = extracted

            submission.extracted_data = existing
            submission.status = SubmissionStatus.CLASSIFIED
            attributes.flag_modified(submission, "extracted_data")
            logger.info("Extraction complete for submission %s", submission.id)

        except GcpPipelineError as exc:
            logger.error("Gemini extraction failed for submission %s: %s", submission.id, exc)
            submission.status = SubmissionStatus.FLAGGED
        except Exception as exc:
            logger.exception("Unexpected error extracting submission %s", submission.id)
            submission.status = SubmissionStatus.FLAGGED

        await db.commit()


async def _run_extractions_background(
    submission_ids: list[UUID],
    school_year_id: UUID | None,
) -> None:
    """Extract field data for pre-validated submissions.

    All IDs passed here have already passed the pre-flight schema check
    in extract_all_documents. We re-load schemas in our own session and
    process with bounded concurrency.
    """
    from sqlalchemy import select as sa_select

    async with AsyncSessionLocal() as schema_db:
        result = await schema_db.execute(
            sa_select(DocumentSubmission)
            .where(DocumentSubmission.id.in_(submission_ids))
        )
        submissions = list(result.scalars().all())
        if not submissions:
            return

        schemas_by_type: dict[UUID, ExtractionSchema] = {}
        if school_year_id:
            req_result = await schema_db.execute(
                sa_select(SchoolYearRequirement)
                .where(
                    SchoolYearRequirement.school_year_id == school_year_id,
                    SchoolYearRequirement.extraction_schema_id.isnot(None),
                )
            )
            for req in req_result.scalars().all():
                if not req.document_type_id:
                    continue
                schema = await schema_db.get(ExtractionSchema, req.extraction_schema_id)
                if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                    schemas_by_type[req.document_type_id] = schema
        else:
            logger.warning("Student has no school_year_id, cannot look up extraction schemas")

        tasks: list[tuple[UUID, list]] = []
        for sub in submissions:
            schema = schemas_by_type.get(sub.document_type_id)
            if schema is None or not schema.fields_json:
                logger.error(
                    "Submission %s (doc_type=%s) has no schema despite pre-flight check",
                    sub.id, sub.document_type_id,
                )
                continue
            tasks.append((sub.id, schema.fields_json))

        if not tasks:
            return

    semaphore = asyncio.Semaphore(2)

    async def worker(sub_id: UUID, fields: list) -> None:
        async with semaphore:
            await _extract_single(sub_id, fields)

    await asyncio.gather(*(worker(sub_id, fields) for sub_id, fields in tasks))


@router.post("/api/me/documents/extract-all", response_model=list[SubmissionDetailResponse])
async def extract_all_documents(
    current_user: StudentClaims,
    db: SessionDep,
    body: ExtractAllRequest | None = None,
) -> list[SubmissionDetailResponse]:
    """Extract field data for classified document submissions.

    Database-first gatekeeping: only submissions with a valid, non-archived
    extraction schema AND no existing extracted_data are set to PROCESSING
    and passed to the background extraction task.
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
                select(DocumentSubmission)
                .options(selectinload(DocumentSubmission.document_type))
                .where(DocumentSubmission.id.in_(unique_ids))
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
            select(DocumentSubmission)
            .options(selectinload(DocumentSubmission.document_type))
            .where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.status.in_(eligible_statuses),
                DocumentSubmission.document_type_id.isnot(None),
            )
        )
        submissions = list(result.scalars().all())

    if not submissions:
        return []

    # ── Pre-flight schema check ──────────────────────────────────────────
    # Fetch extraction schemas for the student's school year so we can
    # determine eligibility BEFORE flipping any status to PROCESSING.
    schemas_by_type: dict[UUID, ExtractionSchema] = {}
    if student.school_year_id:
        req_result = await db.execute(
            select(SchoolYearRequirement)
            .where(
                SchoolYearRequirement.school_year_id == student.school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
        for req in req_result.scalars().all():
            if not req.document_type_id:
                continue
            schema = await db.get(ExtractionSchema, req.extraction_schema_id)
            if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                schemas_by_type[req.document_type_id] = schema

    # Classify each submission into one of three buckets:
    #   - cached:   has extracted_data already (idempotency)
    #   - eligible: has a valid schema AND no extracted_data → will get PROCESSING
    #   - skipped:  no schema for its document_type → stays CLASSIFIED
    cached: list[DocumentSubmission] = []
    eligible: list[DocumentSubmission] = []
    skipped: list[DocumentSubmission] = []

    for sub in submissions:
        if sub.extracted_data:
            cached.append(sub)
        elif sub.document_type_id and sub.document_type_id in schemas_by_type:
            eligible.append(sub)
        else:
            skipped.append(sub)

    # Only flip PROCESSING on submissions that passed the schema check.
    if eligible:
        eligible_ids = [sub.id for sub in eligible]
        for sub in eligible:
            sub.status = SubmissionStatus.PROCESSING
        await db.commit()

        # Run extraction in the background so the POST returns immediately.
        asyncio.create_task(
            _run_extractions_background(eligible_ids, student.school_year_id)
        )

    logger.info(
        "extract-all: %d cached, %d eligible (→ PROCESSING), %d skipped (no schema)",
        len(cached), len(eligible), len(skipped),
    )

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
            document_type_name=sub.document_type.name if sub.document_type else None,
            classification_result=sub.classification_result,
            extracted_data=sub.extracted_data,
            document_type_code=sub.document_type.code if sub.document_type else None,
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
            DocumentSubmission.status.in_((SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED, SubmissionStatus.PROCESSING)),
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
            .where(
                SchoolYearRequirement.school_year_id == student.school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
        for req in req_result.scalars().all():
            if not req.document_type_id:
                continue
            schema = await db.get(ExtractionSchema, req.extraction_schema_id)
            if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                schemas_by_type[req.document_type_id] = schema

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
                for k, v in raw_entry.items():
                    if isinstance(v, dict):
                        raw_val = v.get("value")
                        raw_kie_data[k] = "" if raw_val is None else str(raw_val)
                    else:
                        raw_kie_data[k] = str(v)
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
                value = str(existing.get("value", "") or "")
                needs_review = existing.get("needs_review", True)
                confidence = existing.get("confidence", 0.0)
                source_key = existing.get("source_key")
            else:
                value = str(existing) if existing else ""
                needs_review = True
                confidence = 0.0
                source_key = None

            if not field_def.get("required", False) and value == "":
                needs_review = False

            if value:
                options = field_def.get("options") or []
                if options:
                    matched = next(
                        (o["value"] for o in options if o.get("label", "").lower() == value.lower()),
                        next(
                            (o["value"] for o in options if o.get("value", "").lower() == value.lower()),
                            None,
                        ),
                    )
                    if matched:
                        value = matched

                if field_def.get("ui_component") == "date_picker" and "/" in value:
                    parts = value.split("/")
                    if len(parts) == 3 and len(parts[2]) == 4:
                        value = f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"

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
                ui_component=field_def.get("ui_component"),
                options=field_def.get("options"),
                section_id=field_def.get("section_id"),
                section_title=field_def.get("section_title"),
                hierarchy_level=field_def.get("hierarchy_level", 1),
                parent_field_id=field_def.get("parent_field_id"),
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


class SaveExtractionFieldRequest(BaseModel):
    field_id: str
    value: str


@router.patch("/api/me/documents/{submission_id}/extraction", response_model=ExtractionFieldResponse)
async def save_extraction_field(
    submission_id: UUID,
    body: SaveExtractionFieldRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> ExtractionFieldResponse:
    """Save a single extracted field value for a document submission.

    Stores the field value in `extracted_data` JSONB, keyed by field_id.
    Also sets `needs_review` to False once the user has touched the field.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this submission.")

    extracted = submission.extracted_data or {}
    if not isinstance(extracted, dict):
        extracted = {}

    extracted[body.field_id] = {
        "value": body.value,
        "needs_review": False,
        "confidence": 1.0,
        "source_key": "manual",
    }

    submission.extracted_data = extracted
    attributes.flag_modified(submission, "extracted_data")
    await db.commit()
    await db.refresh(submission)

    return ExtractionFieldResponse(
        id=body.field_id,
        key=body.field_id,
        value=body.value,
        needs_review=False,
        confidence=1.0,
        source_key="manual",
    )


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
    url = gcs_generate_presigned_url(submission.file_key)
    return DownloadUrlResponse(url=url, expires_in=3600)
