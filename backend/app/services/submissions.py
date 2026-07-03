from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import attributes

from ..database import SessionDep
from ..models import (
    Adviser,
    DocumentSubmission,
    DocumentSubmissionHistory,
    DocumentType,
    ExtractionSchema,
    ExtractionSchemaStatus,
    Notification,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
    User,
)
from .adviser_core import get_department_ids_for_adviser, get_school_year_id
from .gcp_storage import generate_presigned_url as gcs_generate_presigned_url
from .helpers import compute_initials, exclude_replaced_submissions, relative_time


async def log_submission_event(
    db: SessionDep,
    submission_id: uuid.UUID,
    action: str,
    actor_user_id: uuid.UUID | None = None,
    previous_status: str | None = None,
    new_status: str | None = None,
    reason: str | None = None,
    reference_submission_id: uuid.UUID | None = None,
) -> None:
    entry = DocumentSubmissionHistory(
        submission_id=submission_id,
        actor_user_id=actor_user_id,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason,
        reference_submission_id=reference_submission_id,
    )
    db.add(entry)


async def list_submissions(
    db: SessionDep,
    adviser: Adviser,
    school_year_id_str: str | None,
) -> list[dict]:
    target_school_year_id = await get_school_year_id(db, school_year_id_str)
    if target_school_year_id is None:
        return []

    dept_ids = await get_department_ids_for_adviser(db, adviser, target_school_year_id)
    if not dept_ids:
        return []

    stmt = (
        select(
            DocumentSubmission.id,
            DocumentSubmission.created_at,
            DocumentSubmission.status,
            DocumentSubmission.extracted_data,
            User.first_name,
            User.last_name,
            Student.id.label("student_id"),
            Student.student_number,
            DocumentType.name.label("document_type_name"),
        )
        .select_from(DocumentSubmission)
        .join(Student, DocumentSubmission.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .outerjoin(DocumentType, DocumentSubmission.document_type_id == DocumentType.id)
        .where(
            Student.program_id.in_(dept_ids),
            Student.school_year_id == target_school_year_id,
            DocumentSubmission.status == SubmissionStatus.SUBMITTED,
        )
    )
    stmt = exclude_replaced_submissions(stmt).order_by(desc(DocumentSubmission.created_at))
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": str(row.id),
            "student_id": str(row.student_id) if row.student_id else "",
            "student_name": f"{row.first_name} {row.last_name}".strip(),
            "student_number": row.student_number,
            "initials": compute_initials(row.first_name, row.last_name),
            "document_type_name": row.document_type_name,
            "status": row.status.value if hasattr(row.status, "value") else str(row.status),
            "created_at": relative_time(row.created_at),
            "extraction_fields": row.extracted_data or {},
        }
        for row in rows
    ]


async def get_submission_download_url(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
) -> str | None:
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    if submission.status not in (
        SubmissionStatus.UPLOADED,
        SubmissionStatus.FLAGGED,
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.PROCESSING,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
        SubmissionStatus.VERIFIED,
    ):
        return None

    return gcs_generate_presigned_url(submission.file_key)


async def get_submission_extractions(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
) -> dict | None:
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    if not submission.document_type_id:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    req_result = await db.execute(
        select(SchoolYearRequirement)
        .where(
            SchoolYearRequirement.school_year_id == student.school_year_id,
            SchoolYearRequirement.document_type_id == submission.document_type_id,
            SchoolYearRequirement.extraction_schema_id.isnot(None),
        )
    )
    req = req_result.scalar_one_or_none()

    if req is None or req.extraction_schema_id is None:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    schema = await db.get(ExtractionSchema, req.extraction_schema_id)
    if schema is None or schema.status == ExtractionSchemaStatus.ARCHIVED:
        return {
            "submission_id": str(submission.id),
            "classification_result": submission.classification_result,
            "fields": [],
        }

    extracted = submission.extracted_data or {}
    if not isinstance(extracted, dict):
        extracted = {}

    fields: list[dict] = []
    for field_def in (schema.fields_json or []):
        field_id = field_def.get("id", "")
        existing = extracted.get(field_id, {})
        if isinstance(existing, str):
            value = existing
            needs_review = False
            confidence = 1.0
        elif isinstance(existing, dict):
            value = str(existing.get("value", "") or "")
            needs_review = existing.get("needs_review", True)
            confidence = existing.get("confidence", 0.0)
        else:
            continue

        fields.append({
            "id": field_id,
            "key": field_def.get("key", ""),
            "type": field_def.get("type", "string"),
            "description": field_def.get("description", ""),
            "required": field_def.get("required", False),
            "value": value,
            "confidence": confidence,
            "needs_review": needs_review,
            "ui_component": field_def.get("ui_component"),
            "options": field_def.get("options"),
            "section_title": field_def.get("section_title"),
        })

    return {
        "submission_id": str(submission.id),
        "classification_result": submission.classification_result,
        "fields": fields,
    }


async def save_submission_extraction_field(
    db: SessionDep,
    adviser: Adviser,
    submission_id_str: str,
    field_id: str,
    value: str,
) -> dict | None:
    """Save a single extracted field value for a document submission.

    Stores the field value in `extracted_data` JSONB, keyed by field_id.
    Also sets `needs_review` to False once the adviser has touched the field.
    """
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None
    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    extracted = submission.extracted_data or {}
    if not isinstance(extracted, dict):
        extracted = {}

    extracted[field_id] = {
        "value": value,
        "needs_review": False,
        "confidence": 1.0,
        "source_key": "adviser_manual",
    }

    submission.extracted_data = extracted
    attributes.flag_modified(submission, "extracted_data")
    await db.commit()
    await db.refresh(submission)

    return {
        "field_id": field_id,
        "value": value,
        "needs_review": False,
        "confidence": 1.0,
    }


async def verify_submission(
    db: SessionDep,
    submission_id_str: str,
    adviser: Adviser,
) -> dict | None:
    """Verify a document submission. Sets status to VERIFIED, clears rejection
    state, and creates a notification for the student."""
    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None

    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    now = datetime.now(timezone.utc)
    previous_status = submission.status.value

    submission.status = SubmissionStatus.VERIFIED
    submission.rejection_reason = None
    submission.flagged_at = None
    submission.flagged_by = None
    submission.verified_at = now
    submission.verified_by = adviser.user_id

    await log_submission_event(
        db,
        sub_uuid,
        action="VERIFIED",
        actor_user_id=adviser.user_id,
        previous_status=previous_status,
        new_status=SubmissionStatus.VERIFIED.value,
    )

    notification = Notification(
        recipient_id=student.user_id,
        title="Document Approved",
        message=f"Your document '{submission.original_filename}' has been reviewed and verified.",
        notification_type="DOCUMENT_VERIFIED",
        reference_id=submission.id,
    )
    db.add(notification)

    await db.commit()

    return {
        "status": "verified",
        "submission_id": str(submission.id),
    }


async def flag_submission(
    db: SessionDep,
    submission_id_str: str,
    adviser: Adviser,
    reason: str,
) -> dict | None:
    """Flag a document submission. Sets status to FLAGGED, stores the rejection
    reason, and creates a notification for the student."""
    clean_reason = reason.strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A descriptive reason is required to flag a document.",
        )

    try:
        sub_uuid = uuid.UUID(submission_id_str)
    except ValueError:
        return None

    submission = await db.get(DocumentSubmission, sub_uuid)
    if submission is None:
        return None

    student = await db.get(Student, submission.student_id)
    if student is None:
        return None

    if student.school_year_id is None:
        return None

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        return None

    now = datetime.now(timezone.utc)
    previous_status = submission.status.value

    submission.status = SubmissionStatus.FLAGGED
    submission.rejection_reason = clean_reason
    submission.flagged_at = now
    submission.flagged_by = adviser.user_id
    submission.verified_at = None
    submission.verified_by = None

    await log_submission_event(
        db,
        sub_uuid,
        action="FLAGGED",
        actor_user_id=adviser.user_id,
        previous_status=previous_status,
        new_status=SubmissionStatus.FLAGGED.value,
        reason=clean_reason,
    )

    notification = Notification(
        recipient_id=student.user_id,
        title="Action Required: Document Flagged",
        message=f"Your document '{submission.original_filename}' needs revision: {clean_reason}",
        notification_type="DOCUMENT_FLAGGED",
        reference_id=submission.id,
    )
    db.add(notification)

    await db.commit()

    return {
        "status": "flagged",
        "submission_id": str(submission.id),
        "reason": clean_reason,
    }
