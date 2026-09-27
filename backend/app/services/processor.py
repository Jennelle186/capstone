from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    AdminAuditLog,
    DocumentSubmission,
    DocumentSubmissionHistory,
    DocumentType,
    DocumentTypeStatus,
    SchoolYearRequirement,
    SubmissionStatus,
)
from ..services.compiled_split import classify_page_images, split_compiled_submission
from ..services.gcp_pipeline import (
    GcpPipelineError,
    process_document_sync,
)
from ..services.gcp_storage import delete_file, download_file_bytes
from ..services.pdf_service import detect_compiled_document, normalize_to_pages
from ..services.requirements import has_verified_submission

AUTO_ACCEPT_THRESHOLD = 0.80
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


async def _get_required_document_types(
    session,
    school_year_id: UUID,
    classification: str | None,
) -> list[DocumentType]:
    stmt = (
        select(DocumentType)
        .join(
            SchoolYearRequirement,
            SchoolYearRequirement.document_type_id == DocumentType.id,
        )
        .where(
            SchoolYearRequirement.school_year_id == school_year_id,
        )
        .order_by(DocumentType.name)
    )
    types = list((await session.execute(stmt)).scalars().all())
    if classification is None:
        return types
    return [
        dt for dt in types
        if not dt.applicable_classifications
        or classification in dt.applicable_classifications
    ]


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


async def _check_document_type_conflict(
    session,
    student_id: UUID,
    document_type_id: UUID,
    exclude_submission_id: UUID,
) -> bool:
    """Return True if a SUBMITTED or IN_REVIEW doc already claims this document type."""
    result = await session.execute(
        select(DocumentSubmission).where(
            DocumentSubmission.student_id == student_id,
            DocumentSubmission.document_type_id == document_type_id,
            DocumentSubmission.status.in_([
                SubmissionStatus.SUBMITTED,
                SubmissionStatus.IN_REVIEW,
            ]),
            DocumentSubmission.id != exclude_submission_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _save_classification(
    session,
    submission: DocumentSubmission,
    status: SubmissionStatus,
    classification_result: dict,
    document_type_id=None,
    reason: str | None = None,
) -> None:
    previous_status = submission.status.value
    submission.status = status
    submission.classification_result = classification_result
    if document_type_id is not None:
        submission.document_type_id = document_type_id
    session.add(
        DocumentSubmissionHistory(
            submission_id=submission.id,
            action=status.value.upper().replace("-", "_"),
            previous_status=previous_status,
            new_status=status.value,
            reason=reason,
        )
    )
    await session.commit()


async def _process_compiled_submission(
    session: AsyncSession,
    submission: DocumentSubmission,
    school_year_id: UUID | None,
    classification: str | None,
) -> bool:
    """Split a compiled (multi-document) PDF into child submissions.

    Returns True when the submission was handled (split, flagged, or already
    split); False when every page classifies to a single type (or the file is
    not a PDF), meaning the normal single-document flow should run.
    """
    if submission.is_compiled_parent:
        logger.info("process_submission: %s already split; skipping re-split", submission.id)
        return True

    # Splitting is PDF-only: an image flagged "compiled" can't be a multi-page
    # container, so let the normal single-document classification handle it.
    if (submission.mime_type or "").lower() != "application/pdf":
        logger.info(
            "process_submission: compiled flag on non-PDF %s; treating as single document",
            submission.id,
        )
        return False

    # Determine the document types used for classification vs. the ones the
    # student actually needs. Classification runs against ALL active types so a
    # non-required page (e.g. an extra Good Moral certificate) is labelled
    # correctly and can then be dropped; if we only offered required types, the
    # model would be forced to map every page onto a required label and those
    # "unnecessary" pages could never be identified as removable.
    classification_types = await _get_active_document_types(session)
    if school_year_id:
        required_type_ids = {
            dt.id
            for dt in await _get_required_document_types(
                session, school_year_id, classification
            )
        }
    else:
        required_type_ids = {dt.id for dt in classification_types}

    try:
        content = await asyncio.to_thread(download_file_bytes, submission.file_key)
    except HTTPException as exc:
        raise GcpPipelineError(f"GCS download failed: {exc.detail}") from exc

    page_images = await asyncio.to_thread(
        normalize_to_pages, content, "application/pdf"
    )
    logger.info(
        "process_submission: compiled PDF %s has %d page(s); classifying against %d type(s): %s",
        submission.id,
        len(page_images),
        len(classification_types),
        [dt.code for dt in classification_types],
    )

    page_classifications = await classify_page_images(page_images, classification_types)
    _, segments = detect_compiled_document(page_classifications)
    logger.info(
        "process_submission: compiled detection for %s -> distinct_types=%s, per_page=%s",
        submission.id,
        sorted({c.type_code for c in page_classifications if c.type_code}),
        [c.type_code for c in page_classifications],
    )

    # The user flagged this submission as a compiled PDF, so we ALWAYS split it —
    # even when every page classifies to the same type or some pages are
    # unclassifiable (null). The split produces one child per distinct/unknown
    # segment, and each child is then filtered against the requirements so
    # "unnecessary" documents can be dropped. The only non-splittable case is a
    # PDF where *every* page failed to classify — keep it FLAGGED rather than
    # splitting into zero usable children.
    if not any(c.type_code for c in page_classifications):
        await _save_classification(
            session,
            submission,
            SubmissionStatus.FLAGGED,
            {"flag": "compiled_pages_unrecognized", "page_count": len(page_images)},
        )
        return True

    children = await split_compiled_submission(
        session,
        submission,
        classification_types,
        page_classifications,
        segments,
        content,
        required_type_ids,
    )

    if not children:
        # Every segment was skipped (verified, non-required, or a mix) — the
        # whole container is redundant. Hard-delete it (with an audit entry) like
        # the single-doc duplicate-verified path, instead of leaving an invisible
        # orphan with zero children that the list endpoint hides and the UI can't
        # delete. Per-segment audit entries above already record why each was
        # skipped.
        file_key = submission.file_key
        await session.delete(submission)
        session.add(
            AdminAuditLog(
                action="AUTO_DELETED_COMPILED_CONTAINER",
                entity_type="document_submission",
                entity_id=submission.id,
                audit_metadata={
                    "reason": "compiled_no_keepable_segments",
                    "original_filename": submission.original_filename,
                },
            )
        )
        await session.commit()
        await asyncio.to_thread(delete_file, file_key)
        logger.info(
            "process_submission: deleted compiled container %s — no keepable segments",
            submission.id,
        )
        return True

    segments_meta = []
    for segment in segments:
        dt = _find_document_type_by_code(classification_types, segment.type_code)
        segments_meta.append(
            {
                "page_range": ",".join(f"{s + 1}-{e + 1}" for s, e in segment.ranges),
                "type": segment.type_code,
                "document_type_id": str(dt.id) if dt else None,
            }
        )

    submission.status = SubmissionStatus.CLASSIFIED
    submission.document_type_id = None
    submission.is_compiled_parent = True
    submission.page_count = len(page_images)
    submission.classification_result = {
        "compiled_parent": True,
        "segments": segments_meta,
    }
    session.add(
        DocumentSubmissionHistory(
            submission_id=submission.id,
            action="SPLIT",
            previous_status=SubmissionStatus.UPLOADED.value,
            new_status=SubmissionStatus.CLASSIFIED.value,
            reason=f"Split into {len(children)} compiled segments",
        )
    )
    await session.commit()
    logger.info(
        "process_submission: split %s into %d children", submission.id, len(children)
    )
    return True


async def process_submission(
    session: AsyncSession,
    submission_id: UUID,
    school_year_id: UUID | None = None,
    classification: str | None = None,
) -> None:
    """Run AI classification on a single submission.

    Accepts an existing session so the caller (worker or request handler)
    manages transaction boundaries. Idempotent: skips if submission is not
    in UPLOADED status.
    """
    try:
        logger.info("process_submission: starting for %s", submission_id)
        # Lock the row for the duration of the transaction so two concurrent
        # workers cannot both pass the UPLOADED status check and split/classify
        # the same submission (read-modify-write race). The second worker blocks
        # until the first commits, then sees the new status and skips.
        submission_result = await session.execute(
            select(DocumentSubmission)
            .where(DocumentSubmission.id == submission_id)
            .with_for_update()
        )
        submission = submission_result.scalar_one_or_none()
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

        # Claim the row (PROCESSING) and release the FOR UPDATE lock before any
        # expensive external I/O. The compiled path does GCS download, PDF
        # rasterization, and up to N sequential Gemini calls before it commits
        # again — holding the lock that whole time would block delete/resolve
        # requests on the same row indefinitely.
        submission.status = SubmissionStatus.PROCESSING
        session.add(
            DocumentSubmissionHistory(
                submission_id=submission.id,
                action="PROCESSING",
                previous_status=SubmissionStatus.UPLOADED.value,
                new_status=SubmissionStatus.PROCESSING.value,
            )
        )
        await session.commit()
        logger.info("process_submission: status set to PROCESSING for %s", submission_id)

        if submission.is_compiled:
            if await _process_compiled_submission(
                session, submission, school_year_id, classification
            ):
                return
            # Single-type: the "compiled" flag was a false positive — fall
            # through to the normal single-document classification below
            # (the submission is already PROCESSING).

        if school_year_id:
            document_types = await _get_required_document_types(
                session, school_year_id, classification
            )
        else:
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
        match_data = result.get("match")
        classification_result["source"] = (match_data or {}).get("source", "keyword")

        if match_data is None or not match_data.get("type"):
            classification_result["flag"] = "not_a_required_document"
            classification_result["confidence"] = 0.0
            classification_result["reasoning"] = (match_data or {}).get("reasoning", "Document does not match any required type.")
            if extracted_text_length is not None:
                classification_result["extracted_text_length"] = extracted_text_length
            logger.info("process_submission: no match for %s — deleting non-required document", submission_id)
            await asyncio.to_thread(delete_file, submission.file_key)
            await session.delete(submission)
            await session.commit()
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

        # A VERIFIED document of this type is final. If this upload's predicted
        # type is already verified, there is exactly one correct outcome: delete
        # it now rather than letting it become CLASSIFIED and waste an extraction
        # call (or linger as a stale FLAGGED item). Mirrors submit_batch's
        # verified-duplicate cleanup; the audit entry preserves traceability.
        if matched_type is not None and await has_verified_submission(
            session, submission.student_id, matched_type.id,
            exclude_submission_id=submission.id,
        ):
            logger.info(
                "process_submission: auto-deleting %s — type %s already verified",
                submission_id, matched_type.code,
            )
            await asyncio.to_thread(delete_file, submission.file_key)
            await session.delete(submission)
            # Traceable record: DocumentSubmissionHistory is cascade-deleted with
            # the submission, so record the event in the unified audit log instead
            # so a student disputing a "missing" document can be traced.
            session.add(
                AdminAuditLog(
                    action="AUTO_DELETED_DUPLICATE_VERIFIED",
                    entity_type="document_submission",
                    entity_id=submission.id,
                    audit_metadata={
                        "reason": "duplicate_verified",
                        "document_type_id": str(matched_type.id),
                        "document_type_code": matched_type.code,
                        "original_filename": submission.original_filename,
                    },
                )
            )
            await session.commit()
            return

        if confidence >= AUTO_ACCEPT_THRESHOLD and matched_type is not None:
            if await _check_document_type_conflict(
                session, submission.student_id, matched_type.id, submission.id
            ):
                classification_result["flag"] = "slot_conflict"
                classification_result["reasoning"] = "A document for this requirement has already been submitted."
                if extracted_text_length is not None:
                    classification_result["extracted_text_length"] = extracted_text_length
                submission.status = SubmissionStatus.FLAGGED
                submission.classification_result = classification_result
                await session.commit()
                await asyncio.to_thread(delete_file, submission.file_key)
                raise HTTPException(
                    status_code=409,
                    detail="You cannot submit the same document. A record for this requirement has already been submitted and is locked for advisor review.",
                )
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
            if await _check_document_type_conflict(
                session, submission.student_id, matched_type.id, submission.id
            ):
                classification_result["flag"] = "slot_conflict"
                classification_result["reasoning"] = "A document for this requirement has already been submitted."
                if extracted_text_length is not None:
                    classification_result["extracted_text_length"] = extracted_text_length
                submission.status = SubmissionStatus.FLAGGED
                submission.classification_result = classification_result
                await session.commit()
                await asyncio.to_thread(delete_file, submission.file_key)
                raise HTTPException(
                    status_code=409,
                    detail="You cannot submit the same document. A record for this requirement has already been submitted and is locked for advisor review.",
                )
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
                "process_submission: confidence too low (%.2f) for %s — deleting non-required document",
                confidence,
                submission_id,
            )
            await asyncio.to_thread(delete_file, submission.file_key)
            await session.delete(submission)
            await session.commit()
            return

    except HTTPException:
        raise  # re-raise FastAPI exceptions directly
    except GcpPipelineError as exc:
        logger.error("Pipeline error for submission %s: %s", submission_id, exc)
        await _flag_submission(session, submission_id, {"error": "pipeline_error", "detail": str(exc)})
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