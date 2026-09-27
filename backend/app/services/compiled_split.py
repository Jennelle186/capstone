"""Feature 3 (Compiled PDF Splitting) orchestration.

Splits a multi-document PDF into child submissions, one per document type
detected across the pages. Non-contiguous runs of the same type are merged into
a single child. The per-page classification reuses the existing Gemini
classifier via in-memory page images; the children re-enter the normal
extraction pipeline keyed by their own ``document_type_id``.
"""
from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    AdminAuditLog,
    DocumentSubmission,
    DocumentType,
    SubmissionStatus,
)
from .gcp_pipeline import classify_page_bytes
from .gcp_storage import delete_file, make_staging_key, upload_file_bytes
from .pdf_service import CompiledSegment, PageClassification, split_pdf_by_groups
from .requirements import has_verified_submission

logger = logging.getLogger(__name__)


async def classify_page_images(
    page_images: list[bytes],
    document_types: list[DocumentType],
) -> list[PageClassification]:
    """Classify each page image, returning one PageClassification per page.

    Runs sequentially: the enclosing classify job already bounds Gemini
    concurrency via its per-job semaphore, so pages are processed one at a time
    to keep memory and quota usage predictable.

    Logs the document-type set offered to the classifier and each page's result
    so a "compiled PDF splits as one type" failure can be traced back to either
    (a) a too-narrow document-type list, or (b) the model labelling every page
    identically.
    """
    logger.info(
        "classify_page_images: %d page(s) against %d document type(s): %s",
        len(page_images),
        len(document_types),
        [dt.code for dt in document_types],
    )
    results: list[PageClassification] = []
    for index, image in enumerate(page_images):
        match = await asyncio.to_thread(classify_page_bytes, image, "image/jpeg", document_types)
        logger.info(
            "classify_page_images: page %d -> type=%s confidence=%.2f",
            index,
            match.type_code,
            match.confidence,
        )
        results.append(
            PageClassification(
                page_index=index,
                type_code=match.type_code,
                confidence=match.confidence,
            )
        )
    return results


def _format_page_range(ranges: list[tuple[int, int]]) -> str:
    """Render 0-indexed inclusive ranges as a 1-indexed "1-2,5-6" string."""
    if not ranges:
        return ""
    parts = [f"{start + 1}-{end + 1}" for start, end in ranges]
    joined = ",".join(parts)
    if len(joined) <= 20:
        return joined
    # Column is String(20); collapse to the overall span for pathological cases.
    return f"{ranges[0][0] + 1}-{ranges[-1][1] + 1}"


async def split_compiled_submission(
    session: AsyncSession,
    parent: DocumentSubmission,
    document_types: list[DocumentType],
    page_classifications: list[PageClassification],
    segments: list[CompiledSegment],
    content: bytes,
    required_type_ids: set[UUID] | None = None,
) -> list[DocumentSubmission]:
    """Create child submissions from a compiled PDF's detected segments.

    Preconditions: ``content`` is the parent PDF bytes; ``page_classifications``
    and ``segments`` were produced by ``classify_page_images`` +
    ``detect_compiled_document``. The caller sets the parent's final container
    state and commits.

    Per-segment disposition:

    - **Unresolvable type** (``type_code`` not in ``document_types``): skipped
      entirely (no GCS upload, no child row) with an ``AUTO_DELETED_COMPILED_UNKNOWN``
      audit entry — the segment is a document the system cannot match to any
      configured type, so it is treated as "unnecessary" and removed.
    - **Not in requirements** (``dt.id`` not in ``required_type_ids``): skipped
      entirely (no GCS upload, no child row) with an ``AUTO_DELETED_NOT_REQUIRED``
      audit entry — the segment is an "unnecessary" document the student does not
      need for this school year.
    - **Already VERIFIED**: skipped (mirrors the single-document auto-delete
      guard) with an ``AUTO_DELETED_DUPLICATE_VERIFIED`` audit entry.
    - Otherwise: created as a CLASSIFIED child.

    Returns the created child submissions (skipped segments excluded). The
    children are ``session.add``-ed but not committed.
    """
    code_to_type = {dt.code: dt for dt in document_types}

    segment_pdfs = await asyncio.to_thread(split_pdf_by_groups, content, segments)

    children: list[DocumentSubmission] = []
    uploaded_keys: list[str] = []
    try:
        for i, (segment, seg_bytes) in enumerate(zip(segments, segment_pdfs)):
            dt = code_to_type.get(segment.type_code)

            if dt is None:
                logger.info(
                    "split: skipping segment %d (%s) for %s — unresolvable type",
                    i, segment.type_code, parent.id,
                )
                session.add(
                    AdminAuditLog(
                        action="AUTO_DELETED_COMPILED_UNKNOWN",
                        entity_type="document_submission",
                        entity_id=parent.id,
                        audit_metadata={
                            "reason": "compiled_segment_unknown",
                            "document_type_code": segment.type_code,
                            "original_filename": parent.original_filename,
                        },
                    )
                )
                continue

            if required_type_ids is not None and dt.id not in required_type_ids:
                logger.info(
                    "split: skipping segment %d (%s) for %s — type not in requirements",
                    i, segment.type_code, parent.id,
                )
                session.add(
                    AdminAuditLog(
                        action="AUTO_DELETED_NOT_REQUIRED",
                        entity_type="document_submission",
                        entity_id=parent.id,
                        audit_metadata={
                            "reason": "compiled_segment_not_required",
                            "document_type_id": str(dt.id),
                            "document_type_code": dt.code,
                            "original_filename": parent.original_filename,
                        },
                    )
                )
                continue

            if await has_verified_submission(session, parent.student_id, dt.id):
                logger.info(
                    "split: skipping segment %d (%s) for %s — type already verified",
                    i, segment.type_code, parent.id,
                )
                session.add(
                    AdminAuditLog(
                        action="AUTO_DELETED_DUPLICATE_VERIFIED",
                        entity_type="document_submission",
                        entity_id=parent.id,
                        audit_metadata={
                            "reason": "compiled_segment_duplicate_verified",
                            "document_type_id": str(dt.id),
                            "document_type_code": dt.code,
                            "original_filename": parent.original_filename,
                        },
                    )
                )
                continue

            child_key = make_staging_key(
                str(parent.student_id),
                f"{parent.original_filename}.seg{i}.pdf",
            )
            await asyncio.to_thread(upload_file_bytes, child_key, seg_bytes, "application/pdf")
            uploaded_keys.append(child_key)

            page_range = _format_page_range(segment.ranges)

            first_start = segment.ranges[0][0]
            first_page_confidence = (
                page_classifications[first_start].confidence
                if first_start < len(page_classifications)
                else 0.0
            )
            child = _build_child(
                parent,
                child_key,
                page_range,
                segment.page_count,
                i,
                document_type_id=dt.id,
                status=SubmissionStatus.CLASSIFIED,
                classification_result={
                    "type": dt.code,
                    "confidence": first_page_confidence,
                    "reasoning": "Compiled-PDF segment",
                    "source": "compiled_split",
                    "from_compiled": str(parent.id),
                },
            )
            children.append(child)
    except Exception:
        # A mid-loop failure (e.g. transient GCS error on segment N) leaves the
        # already-uploaded segments unreferenced by any DB row. Clean them up so
        # they do not become orphaned garbage.
        for key in uploaded_keys:
            try:
                await asyncio.to_thread(delete_file, key)
            except Exception:
                logger.exception("Failed to clean up orphaned segment file %s", key)
        raise

    session.add_all(children)
    return children


def _build_child(
    parent: DocumentSubmission,
    child_key: str,
    page_range: str,
    page_count: int,
    segment_index: int,
    document_type_id,
    status: SubmissionStatus,
    classification_result: dict,
) -> DocumentSubmission:
    """Build a child DocumentSubmission row (not added); the segment is already uploaded."""
    return DocumentSubmission(
        student_id=parent.student_id,
        file_key=child_key,
        original_filename=f"{parent.original_filename} (pages {page_range})",
        mime_type="application/pdf",
        status=status,
        document_type_id=document_type_id,
        classification_result=classification_result,
        page_range=page_range,
        segment_index=segment_index,
        page_count=page_count,
        parent_submission_id=parent.id,
    )
