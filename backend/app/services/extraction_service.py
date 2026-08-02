from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import attributes

from ..models import DocumentSubmission, SubmissionStatus
from ..services.gcp_pipeline import GcpPipelineError, extract_fields_from_document
from ..utils.computation import apply_computed_fields

logger = logging.getLogger(__name__)


async def extract_single(
    session: AsyncSession,
    submission_id: UUID,
    field_defs: list,
) -> None:
    """Extract fields from a single submission via Gemini.

    Uses the provided session (caller manages commit). Idempotent:
    skips if submission already has extracted_data.
    """
    result = await session.execute(
        select(DocumentSubmission).where(DocumentSubmission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        logger.warning("extract_single: submission %s not found", submission_id)
        return

    if submission.extracted_data:
        logger.info("extract_single: submission %s already has extracted_data, skipping", submission_id)
        submission.status = SubmissionStatus.CLASSIFIED
        return

    try:
        extractable_fields = [f for f in field_defs if not f.get("is_computed")]
        logger.info("Extracting %d fields from %s via Gemini (%d computed fields excluded)",
                     len(extractable_fields), submission.file_key,
                     len(field_defs) - len(extractable_fields))

        extracted = await asyncio.to_thread(
            extract_fields_from_document,
            submission.file_key,
            extractable_fields,
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

            # Store extracted_value alongside value so StepSubmit can compute
            # real extraction accuracy by comparing original AI output vs user edits.
            existing[field_id] = {
                "value": value,
                "extracted_value": value,
                "confidence": confidence,
                "needs_review": confidence < 0.7 if field_def.get("required", True) else False,
                "source_key": field_key,
            }

        # Evaluate computed fields against the freshly extracted data.
        existing = apply_computed_fields(field_defs, existing)

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

    await session.commit()
