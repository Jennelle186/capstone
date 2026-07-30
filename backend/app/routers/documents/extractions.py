from __future__ import annotations


from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import aliased, attributes, selectinload

from ...database import SessionDep
from ...models import (
    DocumentSubmission,
    ExtractionSchema,
    ExtractionSchemaStatus,
    RequirementSlot,
    RequirementSlotItem,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from ...services.job_queue import create_job, duplicate_check
from ...services.user_sync import ensure_user_row
from ...utils.computation import apply_computed_fields
from .schemas import StudentClaims, SubmissionDetailResponse
from .uploads import _require_student_onboarded, _ensure_school_year_not_closed

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
    is_computed: bool = False
    computation: dict | None = None


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


# ── Route handlers ──────────────────────────────────────────────────────────


@router.post("/api/me/documents/extract-all", status_code=202)
async def extract_all_documents(
    current_user: StudentClaims,
    db: SessionDep,
    body: ExtractAllRequest | None = None,
):
    """Extract field data for classified document submissions. Delegates to the async job system."""
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

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
        raise HTTPException(status_code=400, detail="No documents eligible for extraction.")

    # Filter: only submissions that have extraction schemas and no existing extracted_data
    eligible_ids: list[UUID] = []
    if student.school_year_id:
        schema_doc_types = set()

        req_result = await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == student.school_year_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
        for req in req_result.scalars().all():
            if req.document_type_id:
                schema = await db.get(ExtractionSchema, req.extraction_schema_id)
                if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                    schema_doc_types.add(req.document_type_id)

        slot_item_result = await db.execute(
            select(RequirementSlotItem)
            .join(RequirementSlot, RequirementSlotItem.requirement_slot_id == RequirementSlot.id)
            .where(
                RequirementSlot.school_year_id == student.school_year_id,
                RequirementSlotItem.extraction_schema_id.isnot(None),
            )
        )
        for item in slot_item_result.scalars().all():
            if item.document_type_id:
                schema = await db.get(ExtractionSchema, item.extraction_schema_id)
                if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                    schema_doc_types.add(item.document_type_id)

        for sub in submissions:
            if sub.extracted_data:
                continue  # already extracted
            if sub.document_type_id and sub.document_type_id in schema_doc_types:
                eligible_ids.append(sub.id)

    if not eligible_ids:
        raise HTTPException(status_code=400, detail="No documents eligible for extraction (all may already have extracted data).")

    # Duplicate check
    existing = await duplicate_check(db, student.id, "extract")
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An active extraction job is already in progress.",
        )

    job = await create_job(
        db,
        student_id=student.id,
        operation="extract",
        submission_ids=eligible_ids,
        requested_by=student.user_id,
    )

    return {
        "job_id": str(job.id),
        "operation": job.operation,
        "status": job.status.value if job.status else "",
        "progress": job.progress or 0,
        "total": job.total or 0,
    }


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
        try:
            statuses = tuple(SubmissionStatus(s) for s in parts)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid status value: {e}")
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
    submissions = [s for s in submissions if s.document_type_id not in verified_type_ids or s.status == SubmissionStatus.VERIFIED]

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

        slot_item_result = await db.execute(
            select(RequirementSlotItem)
            .join(RequirementSlot, RequirementSlotItem.requirement_slot_id == RequirementSlot.id)
            .where(
                RequirementSlot.school_year_id == student.school_year_id,
                RequirementSlotItem.extraction_schema_id.isnot(None),
            )
        )
        for item in slot_item_result.scalars().all():
            if not item.document_type_id:
                continue
            if item.document_type_id in schemas_by_type:
                continue
            schema = await db.get(ExtractionSchema, item.extraction_schema_id)
            if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                schemas_by_type[item.document_type_id] = schema

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
            is_computed=field_def.get("is_computed", False),
            computation=field_def.get("computation"),
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
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

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

    # Recompute computed fields that depend on the just-saved field.
    if submission.document_type_id and student.school_year_id:
        syr_result = await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == student.school_year_id,
                SchoolYearRequirement.document_type_id == submission.document_type_id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )
        syr = syr_result.scalar_one_or_none()
        if syr:
            schema = await db.get(ExtractionSchema, syr.extraction_schema_id)
            if schema and schema.fields_json:
                affected = [
                    f for f in schema.fields_json
                    if f.get("is_computed")
                    and body.field_id in (f.get("computation") or {}).get("dependencies", [])
                ]
                if affected:
                    extracted = apply_computed_fields(schema.fields_json, extracted)

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
