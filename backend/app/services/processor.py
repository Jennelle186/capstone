from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import AsyncSessionLocal
from ..models import DocumentSubmission, DocumentType, DocumentTypeStatus, SubmissionStatus
from ..services.llama_classify import (
    LlamaClassifyError,
    LlamaNoCreditsError,
    LlamaTimeoutError,
    classify_document,
    extract_classification_result,
    upload_file,
)
from ..services.s3 import generate_presigned_url

# Confidence thresholds for automatic classification vs. flagging.
AUTO_ACCEPT_THRESHOLD = 0.70
REJECT_THRESHOLD = 0.30
# LlamaCloud v2 classify rules limit descriptions to 500 characters.
MAX_RULE_DESCRIPTION_LENGTH = 500

logger = logging.getLogger(__name__)


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


def _build_classification_rules(document_types: list[DocumentType]) -> list[dict[str, str]]:
    """Build LlamaCloud classify rules from active document types.

    Combines the natural-language classifier_description with the stored keywords
    for stronger matching.
    """
    rules = []
    for dt in document_types:
        if not dt.classifier_description:
            continue
        description = dt.classifier_description
        if dt.keywords:
            if isinstance(dt.keywords, list):
                keywords = ", ".join(str(k) for k in dt.keywords)
            else:
                keywords = str(dt.keywords)
            if keywords:
                description += f" Keywords: {keywords}."
        # LlamaCloud v2 rejects descriptions longer than 500 characters; truncate
        # gracefully while preserving the most important classifier context.
        if len(description) > MAX_RULE_DESCRIPTION_LENGTH:
            description = description[:MAX_RULE_DESCRIPTION_LENGTH].rstrip()
        rules.append({
            "type": dt.code,
            "description": description,
        })
    return rules


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


async def process_submission(submission_id: UUID) -> None:
    """Background task: classify an uploaded document using LlamaCloud.

    The simplified pipeline is:
      UPLOADED -> PROCESSING -> (CLASSIFIED | FLAGGED)

    We skip a separate LlamaParse step because LlamaCloud Classify parses the
    document internally. The file_id returned by the upload is retained so a
    future LlamaExtract call can reuse it.

    Classification logic:
      - confidence >= AUTO_ACCEPT_THRESHOLD (0.70) => CLASSIFIED
      - REJECT_THRESHOLD (0.30) <= confidence < 0.70 => FLAGGED (low_confidence)
      - confidence < 0.30 or no match => FLAGGED (not_a_required_document)

    Compiled documents are not supported in this phase and are flagged.
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

            # Compiled documents need LlamaCloud Split, which is deferred.
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

            # Generate a presigned URL so LlamaCloud can fetch the file from S3.
            # boto3 is synchronous, so run it in a thread pool to avoid blocking
            # the FastAPI event loop for other background tasks.
            presigned_url = await asyncio.to_thread(generate_presigned_url, submission.file_key)

            # Upload the file to LlamaCloud and get a file_id for classify/extract.
            llama_file_id = await upload_file(
                presigned_url,
                submission.original_filename,
                submission.mime_type or "application/octet-stream",
            )
            submission.llama_job_id = llama_file_id
            await session.commit()
            logger.info("process_submission: uploaded to LlamaCloud file_id=%s for %s", llama_file_id, submission_id)

            # Load active document types for classification rules.
            document_types = await _get_active_document_types(session)
            rules = _build_classification_rules(document_types)
            logger.info("process_submission: built %d classification rules for %s", len(rules), submission_id)

            classification_result = {
                "llama_file_id": llama_file_id,
            }

            if not rules:
                # No classification rules configured; keep the file_id but do not
                # auto-classify. The student/admin will need to assign a type.
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

            # Classify the document against the configured document types.
            classify_response = await classify_document(llama_file_id, rules)
            logger.info("process_submission: classify response received for %s", submission_id)
            match = extract_classification_result(classify_response)
            logger.info("process_submission: extracted match=%s for %s", match, submission_id)

            if match is None:
                classification_result["flag"] = "not_a_required_document"
                classification_result["confidence"] = 0
                logger.info("process_submission: no classify match for %s", submission_id)
                await _save_classification(
                    session,
                    submission,
                    SubmissionStatus.FLAGGED,
                    classification_result,
                    document_type_id=None,
                )
                return

            confidence = float(match.get("confidence") or 0.0)
            matched_type = _find_document_type_by_code(document_types, match.get("type"))

            classification_result.update(
                {
                    "type": match.get("type"),
                    "confidence": confidence,
                    "reasoning": match.get("reasoning", ""),
                }
            )

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

        except LlamaNoCreditsError as exc:
            logger.error("LlamaCloud credits exhausted for submission %s: %s", submission_id, exc)
            await _flag_submission(session, submission_id, {"error": "credits_exhausted"})
        except LlamaTimeoutError as exc:
            logger.error("LlamaCloud timeout for submission %s: %s", submission_id, exc)
            await _flag_submission(session, submission_id, {"error": "processing_timeout"})
        except LlamaClassifyError as exc:
            logger.error("LlamaCloud error for submission %s: %s", submission_id, exc)
            await _flag_submission(session, submission_id, {"error": "llama_error", "detail": str(exc)})
        except Exception as exc:
            logger.exception("Unexpected error processing submission %s", submission_id)
            await _flag_submission(session, submission_id, {"error": "unexpected", "detail": str(exc)})


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
