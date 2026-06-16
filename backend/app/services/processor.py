from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import AsyncSessionLocal
from ..models import DocumentSubmission, DocumentType, DocumentTypeStatus, SubmissionStatus
from .s3 import download_file
from .vlm_pipeline import process_document

logger = logging.getLogger(__name__)

# Confidence thresholds for automatic classification vs. flagging.
# These are on a 0-100 scale to match the frontend/LlamaCloud convention.
AUTO_ACCEPT_THRESHOLD = 70.0
REJECT_THRESHOLD = 30.0


async def _get_active_document_types(session) -> list[DocumentType]:
    """Return active document types that have a classifier description."""
    result = await session.execute(
        select(DocumentType)
        .where(
            DocumentType.status == DocumentTypeStatus.ACTIVE,
            DocumentType.classifier_description.isnot(None),
        )
        .order_by(DocumentType.name)
    )
    return list(result.scalars().all())


def _find_document_type_by_code(
    document_types: list[DocumentType],
    code: str | None,
) -> DocumentType | None:
    """Find a document type in the list by its unique code."""
    if not code:
        return None
    for dt in document_types:
        if dt.code == code:
            return dt
    return None


async def _save_classification(
    session,
    submission: DocumentSubmission,
    status: SubmissionStatus,
    classification_result: dict,
    document_type_id=None,
) -> None:
    """Persist the classification result and status to the submission row."""
    submission.status = status
    submission.classification_result = classification_result
    if document_type_id is not None:
        submission.document_type_id = document_type_id
    await session.commit()


async def _flag_submission(session, submission_id: UUID, classification_result: dict) -> None:
    """Load the submission and set its status to FLAGGED with the given result."""
    try:
        submission = await session.get(DocumentSubmission, submission_id)
        if submission is None:
            return
        submission.status = SubmissionStatus.FLAGGED
        submission.classification_result = classification_result
        await session.commit()
        logger.info("process_submission: flagged %s with %s", submission_id, classification_result)
    except Exception:
        logger.exception("Failed to flag submission %s", submission_id)


async def process_submission(submission_id: UUID) -> None:
    """Background task: classify an uploaded document using the hybrid VLM pipeline.

    Pipeline:
      UPLOADED -> PROCESSING -> (CLASSIFIED | FLAGGED)

    Classification logic:
      - confidence >= AUTO_ACCEPT_THRESHOLD (0.70) => CLASSIFIED
      - REJECT_THRESHOLD (0.30) <= confidence < 0.70 => FLAGGED (low_confidence)
      - confidence < 0.30 or no match => FLAGGED (not_a_required_document)

    Compiled documents are now supported: each page is classified and the result
    includes a compiled_detection section. If the primary type cannot be
    determined, the submission is flagged.
    """
    async with AsyncSessionLocal() as session:
        try:
            logger.info("process_submission: starting for %s", submission_id)
            submission = await session.get(DocumentSubmission, submission_id)
            if submission is None:
                logger.warning("process_submission: submission %s not found", submission_id)
                return

            # Guard against duplicate or stale background task runs.
            if submission.status != SubmissionStatus.UPLOADED:
                logger.info(
                    "process_submission: submission %s has status %s, skipping",
                    submission_id,
                    submission.status.value,
                )
                return

            submission.status = SubmissionStatus.PROCESSING
            await session.commit()
            logger.info("process_submission: status set to PROCESSING for %s", submission_id)

            # Download the file from S3 to a temporary local path.
            suffix = Path(submission.original_filename).suffix or ".pdf"
            with tempfile.TemporaryDirectory() as tmpdir:
                local_path = Path(tmpdir) / f"{submission_id}{suffix}"
                await asyncio.to_thread(
                    download_file,
                    submission.file_key,
                    local_path,
                )
                logger.info("process_submission: downloaded %s to %s", submission_id, local_path)

                # Run the hybrid VLM pipeline.
                pipeline_result = await process_document(
                    local_path,
                    skip_extraction=False,
                )

            classification_info = pipeline_result.get("classification", {})
            doc_type_code = classification_info.get("type")
            # The frontend expects confidence on a 0-100 scale (LlamaCloud style).
            raw_confidence = float(classification_info.get("confidence") or 0.0)
            confidence = raw_confidence * 100 if raw_confidence <= 1.0 else raw_confidence

            classification_result = {
                "type": doc_type_code,
                "confidence": confidence,
                "reasoning": classification_info.get("reasoning", ""),
                "compiled_detection": pipeline_result.get("compiled_detection", {}),
                "page_count": pipeline_result.get("page_count"),
                "total_elapsed_ms": pipeline_result.get("total_elapsed_ms"),
                "classification_mode": pipeline_result.get("classification_mode"),
                "processing_log": {
                    "ocr_model": "ibm/granite-docling",
                    "classify_model": "qwen2.5:3b",
                    "vlm_fallback": bool(pipeline_result.get("classification_fallback")),
                },
            }

            # Persist OCR output and extraction separately if available.
            if "extraction" in pipeline_result:
                classification_result["extraction"] = pipeline_result["extraction"]
                submission.extracted_data = pipeline_result["extraction"].get("result")

            # Load active document types to validate the classification.
            document_types = await _get_active_document_types(session)
            matched_type = _find_document_type_by_code(document_types, doc_type_code)

            if matched_type is None:
                classification_result["flag"] = "not_a_required_document"
                logger.info(
                    "process_submission: type %s not in required documents for %s",
                    doc_type_code,
                    submission_id,
                )
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    classification_result,
                    document_type_id=None,
                )
                return

            # Auto-classify or flag based on confidence.
            if confidence >= AUTO_ACCEPT_THRESHOLD:
                logger.info(
                    "process_submission: auto-classified as %s (%.2f) for %s",
                    matched_type.code,
                    confidence,
                    submission_id,
                )
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.CLASSIFIED,
                    classification_result,
                    document_type_id=matched_type.id,
                )
            elif confidence >= REJECT_THRESHOLD:
                classification_result["flag"] = "low_confidence"
                logger.info(
                    "process_submission: low-confidence match %s (%.2f) for %s",
                    matched_type.code,
                    confidence,
                    submission_id,
                )
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    classification_result,
                    document_type_id=matched_type.id,
                )
            else:
                classification_result["flag"] = "not_a_required_document"
                logger.info(
                    "process_submission: confidence too low (%.2f) for %s",
                    confidence,
                    submission_id,
                )
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    classification_result,
                    document_type_id=None,
                )

        except Exception as exc:
            logger.exception("Unexpected error processing submission %s", submission_id)
            await _flag_submission(session, submission_id, {"error": "unexpected", "detail": str(exc)})
