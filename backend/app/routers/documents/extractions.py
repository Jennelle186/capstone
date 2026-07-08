from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import aliased, attributes, selectinload

from ...database import AsyncSessionLocal, SessionDep
from ...models import (
    DocumentSubmission,
    ExtractionSchema,
    ExtractionSchemaStatus,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from ...services.gcp_pipeline import GcpPipelineError, extract_fields_from_document
from ...services.user_sync import ensure_user_row
from .schemas import StudentClaims, SubmissionDetailResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


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
    read_only: bool = False


class ExtractionItemResponse(BaseModel):
    submission_id: str
    file_name: str
    document_type_name: str | None = None
    document_type_code: str | None = None
    status: str
    fields: list[ExtractionFieldResponse]
    ocr_text: str = ""
    raw_kie: dict[str, str] = Field(default_factory=dict)


class ExtractAllRequest(BaseModel):
    submission_ids: list[str] | None = None


class SaveExtractionFieldRequest(BaseModel):
    field_id: str
    value: str


# ── Background tasks ────────────────────────────────────────────────────────


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
    async with AsyncSessionLocal() as schema_db:
        result = await schema_db.execute(
            select(DocumentSubmission)
            .where(DocumentSubmission.id.in_(submission_ids))
        )
        submissions = list(result.scalars().all())
        if not submissions:
            return

        schemas_by_type: dict[UUID, ExtractionSchema] = {}
        if school_year_id:
            req_result = await schema_db.execute(
                select(SchoolYearRequirement)
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


# ── Route handlers ──────────────────────────────────────────────────────────


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
        replacement = aliased(DocumentSubmission)
        result = await db.execute(
            select(DocumentSubmission)
            .options(selectinload(DocumentSubmission.document_type))
            .outerjoin(
                replacement,
                (replacement.parent_submission_id == DocumentSubmission.id)
                & (replacement.student_id == student.id),
            )
            .where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.status.in_(eligible_statuses),
                DocumentSubmission.document_type_id.isnot(None),
                replacement.id.is_(None),
            )
            .order_by(desc(DocumentSubmission.created_at))
        )
        submissions = list(result.scalars().all())

    if not submissions:
        return []

    # ── Pre-flight schema check ──────────────────────────────────────────
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

    if eligible:
        eligible_ids = [sub.id for sub in eligible]
        for sub in eligible:
            sub.status = SubmissionStatus.PROCESSING
        await db.commit()

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
    status: str | None = Query(None, description="Optional comma-separated statuses to filter by (defaults to CLASSIFIED,FLAGGED,PROCESSING)"),
) -> list[ExtractionItemResponse]:
    """Return extraction data for document submissions with extraction schemas.

    For each matching submission belonging to the student, if the document
    type has an active extraction schema, the schema fields are merged with
    any existing extracted_data values and returned.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        return []

    statuses: tuple[SubmissionStatus, ...]
    if status:
        parts = [s.strip() for s in status.split(",")]
        statuses = tuple(SubmissionStatus(s) for s in parts)
    else:
        statuses = (SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED, SubmissionStatus.PROCESSING)

    replacement = aliased(DocumentSubmission)

    submissions_result = await db.execute(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .outerjoin(
            replacement,
            (replacement.parent_submission_id == DocumentSubmission.id)
            & (replacement.student_id == student.id),
        )
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_(statuses),
            DocumentSubmission.document_type_id.isnot(None),
            replacement.id.is_(None),
        )
        .order_by(desc(DocumentSubmission.created_at))
    )
    submissions = list(submissions_result.scalars().all())

    # Keep only the latest submission per document type
    latest_by_type: dict[UUID, DocumentSubmission] = {}
    for sub in submissions:
        if sub.document_type_id not in latest_by_type:
            latest_by_type[sub.document_type_id] = sub
    submissions = list(latest_by_type.values())

    verified_type_ids = set(
        (await db.execute(
            select(DocumentSubmission.document_type_id).where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.status == SubmissionStatus.VERIFIED,
            )
        )).scalars().all()
    )
    submissions = [s for s in submissions if s.document_type_id not in verified_type_ids]

    if not submissions:
        return []

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
                read_only=field_def.get("readOnly", False),
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
