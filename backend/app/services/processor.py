from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import DocumentSubmission, DocumentType, DocumentTypeStatus, SubmissionStatus
from ..services.aws_pipeline import (
    TextractError,
    UnsupportedDocumentError,
    process_document_sync,
)

AUTO_ACCEPT_THRESHOLD = 0.70
REJECT_THRESHOLD = 0.30

logger = logging.getLogger(__name__)


async def _get_active_document_types(session) -> list[DocumentType]:
    result = await session.execute(
        select(DocumentType)
        .where(
            DocumentType.status == DocumentTypeStatus.ACTIVE,
        )
        .order_by(DocumentType.name)
    )
    return list(result.scalars().all())


def _find_document_type_by_code(
    document_types: list[DocumentType],
    code: str | None,
) -> DocumentType | None:
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
    submission.status = status
    submission.classification_result = classification_result
    if document_type_id is not None:
        submission.document_type_id = document_type_id
    await session.commit()


async def process_submission(submission_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        try:
            logger.info("process_submission: starting for %s", submission_id)
            submission = await session.get(DocumentSubmission, submission_id)
            if submission is None:
                logger.warning("process_submission: submission %s not found", submission_id)
                return

            if submission.status != SubmissionStatus.UPLOADED:
                logger.info(
                    "process_submission: submission %s has status %s, skipping",
                    submission_id,
                    submission.status.value,
                )
                return

            if submission.is_compiled:
                logger.info("process_submission: compiled document not supported for %s", submission_id)
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    {"flag": "compiled_document_not_supported"},
                )
                return

            submission.status = SubmissionStatus.PROCESSING
            await session.commit()
            logger.info("process_submission: status set to PROCESSING for %s", submission_id)

            document_types = await _get_active_document_types(session)

            classification_result: dict = {}

            doc_types_with_keywords = [
                dt for dt in document_types
                if dt.classifier_description or (isinstance(dt.keywords, list) and dt.keywords)
            ]

            if not doc_types_with_keywords:
                classification_result["note"] = "no_classification_rules_configured"
                logger.info("process_submission: no rules configured for %s", submission_id)
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.CLASSIFIED,
                    classification_result,
                    document_type_id=None,
                )
                return

            result = await asyncio.to_thread(
                process_document_sync,
                submission.file_key,
                document_types,
            )

            extracted_text_length = result.get("extracted_text_length")
            textract_job_id = result.get("textract_job_id")
            if textract_job_id:
                submission.llama_job_id = textract_job_id

            if result.get("flag") == "unsupported_file_format":
                classification_result["flag"] = "unsupported_file_format"
                classification_result["confidence"] = 0.0
                classification_result["reasoning"] = result.get("reasoning", "Textract does not support this document format.")
                if extracted_text_length is not None:
                    classification_result["extracted_text_length"] = extracted_text_length
                logger.info(
                    "process_submission: unsupported file format for %s",
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

            if result.get("flag") == "text_too_short":
                classification_result["flag"] = "text_too_short"
                classification_result["confidence"] = 0.0
                classification_result["extracted_text_length"] = extracted_text_length
                logger.info(
                    "process_submission: text too short (%d chars) for %s",
                    extracted_text_length,
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

            match_data = result.get("match")
            if match_data is None:
                classification_result["flag"] = "not_a_required_document"
                classification_result["confidence"] = 0.0
                classification_result["reasoning"] = result.get("reasoning", "No keywords matched.")
                if extracted_text_length is not None:
                    classification_result["extracted_text_length"] = extracted_text_length
                logger.info("process_submission: no match for %s", submission_id)
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    classification_result,
                    document_type_id=None,
                )
                return

            confidence = float(match_data.get("confidence") or 0.0)
            matched_type = _find_document_type_by_code(document_types, match_data.get("type"))

            classification_result.update(
                {
                    "type": match_data.get("type"),
                    "confidence": confidence,
                    "reasoning": match_data.get("reasoning", ""),
                    "source": match_data.get("source", "keyword"),
                }
            )
            if extracted_text_length is not None:
                classification_result["extracted_text_length"] = extracted_text_length

            if confidence >= AUTO_ACCEPT_THRESHOLD and matched_type is not None:
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
            elif confidence >= REJECT_THRESHOLD and matched_type is not None:
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

        except UnsupportedDocumentError as exc:
            logger.error("Unsupported document format for submission %s: %s", submission_id, exc)
            await _flag_submission(session, submission_id, {"flag": "unsupported_file_format", "reasoning": str(exc)})
        except TextractError as exc:
            logger.error("Textract error for submission %s: %s", submission_id, exc)
            await _flag_submission(session, submission_id, {"error": "textract_error", "detail": str(exc)})
        except Exception as exc:
            logger.exception("Unexpected error processing submission %s", submission_id)
            await _flag_submission(session, submission_id, {"error": "unexpected", "detail": str(exc)})


async def _flag_submission(session, submission_id: UUID, classification_result: dict) -> None:
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