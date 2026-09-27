import asyncio
import logging
import zlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, select, text
from sqlalchemy.orm import aliased, selectinload

from ...database import SessionDep
from ...models import DocumentSubmission, DocumentSubmissionHistory, DocumentType, SchoolYear, SchoolYearStatus, Student, SubmissionStatus, User
from ...services.gcp_storage import (
    delete_file as gcs_delete_file,
    generate_presigned_post as gcs_generate_presigned_post,
    generate_presigned_url as gcs_generate_presigned_url,
    head_object as gcs_head_object,
    make_staging_key,
)
from ...services.helpers import exclude_replaced_submissions
from ...services.requirements import get_student_slot_statuses, has_verified_submission, latest_submission_per_type
from ...services.user_sync import ensure_user_row
from .schemas import StudentClaims, SubmissionDetailResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])


# Statuses that lock a submission (or a compiled segment) against deletion.
# Shared by the top-level delete guard and the compiled-parent cascade so the
# two checks cannot drift apart: any row in one of these states is either
# already committed to the adviser review workflow or being actively processed.
DELETE_LOCKED_STATUSES = (
    SubmissionStatus.VERIFIED,
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.IN_REVIEW,
    SubmissionStatus.PROCESSING,
)


async def _ensure_school_year_not_closed(db: SessionDep, student: Student) -> None:
    if student.school_year_id is None:
        return
    sy = await db.get(SchoolYear, student.school_year_id)
    if sy is not None and sy.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=409,
            detail="Your school year is closed and archived. Document uploads and edits are no longer allowed.",
        )


async def _require_student_onboarded(db: SessionDep, current_user: StudentClaims) -> Student:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found. Complete onboarding first.")
    if student.program_id is None:
        raise HTTPException(status_code=400, detail="Please select your program before uploading.")
    if student.classification is None or not student.classification_set_by_user:
        raise HTTPException(status_code=400, detail="Please confirm your student classification before uploading documents.")
    return student


class SubmitBatchRequest(BaseModel):
    submission_ids: list[str] | None = None


class InitiateUploadRequest(BaseModel):
    name: str
    type: str
    size: int
    document_type_id: str | None = None
    is_compiled: bool = False
    replace_submission_id: str | None = None


class InitiateUploadResponse(BaseModel):
    submission_id: str
    url: str
    fields: dict[str, str]
    key: str


class ConfirmUploadRequest(BaseModel):
    submission_id: str


class ConfirmUploadResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    is_compiled: bool


class RetryUploadRequest(BaseModel):
    name: str | None = None
    type: str | None = None
    size: int | None = None


class DownloadUrlResponse(BaseModel):
    url: str
    expires_in: int


class IncompleteSlotMetadata(BaseModel):
    id: str
    name: str
    min_required: int


class SubmitBatchResponse(BaseModel):
    status: str
    submitted_count: int
    skipped_count: int = 0
    skipped: list[dict] = Field(default_factory=list)
    application_status: Literal["SUBMITTED_COMPLETE", "PENDING_DOCUMENTS"] | None = None
    incomplete_slots: list[IncompleteSlotMetadata] = Field(default_factory=list)


@router.post("/api/me/documents/initiate", response_model=InitiateUploadResponse)
async def initiate_upload(
    body: InitiateUploadRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> InitiateUploadResponse:
    """Create a PENDING submission and return a presigned POST URL for direct GCS upload.

    The browser uploads the file directly to GCS using the returned URL and fields,
    then calls POST /api/me/documents/confirm to mark the submission as UPLOADED.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

    # Garbage-collect stale PENDING submissions (orphaned from failed uploads)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    stale_result = await db.execute(
        select(DocumentSubmission).where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status == SubmissionStatus.PENDING,
            DocumentSubmission.created_at < cutoff,
        )
    )
    for stale in stale_result.scalars().all():
        if stale.file_key:
            try:
                await asyncio.to_thread(gcs_delete_file, stale.file_key)
            except Exception:
                logger.exception("Failed to clean up GCS file for stale PENDING submission %s", stale.id)
        await db.delete(stale)

    if body.document_type_id:
        lock_key = zlib.crc32(f"{student.id}:{body.document_type_id}".encode()) & 0x7FFFFFFF
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
        existing = await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.student_id == student.id,
                DocumentSubmission.document_type_id == body.document_type_id,
                DocumentSubmission.status.in_([
                    SubmissionStatus.SUBMITTED,
                    SubmissionStatus.IN_REVIEW,
                ]),
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=409,
                detail="You cannot submit the same document; please wait for confirmation by your adviser.",
            )

        # A VERIFIED document of this type is final — no further uploads allowed.
        # Runs inside the same advisory lock as the SUBMITTED/IN_REVIEW check so a
        # near-simultaneous upload cannot slip past the status read.
        try:
            doc_type_uuid = UUID(body.document_type_id)
        except ValueError:
            doc_type_uuid = None
        if doc_type_uuid is not None:
            if await has_verified_submission(db, student.id, doc_type_uuid):
                dt = await db.get(DocumentType, doc_type_uuid)
                type_name = dt.name if dt else "that document"
                return JSONResponse(
                    status_code=409,
                    content={
                        "detail": f"CONFLICT: '{type_name}' has already been verified by your adviser. You cannot upload it again.",
                        "error_code": "duplicate_verified_document",
                        "document_type_id": str(doc_type_uuid),
                    },
                )

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
        try:
            doc_type_uuid = UUID(body.document_type_id)
            dt_exists = await db.get(DocumentType, doc_type_uuid)
            if dt_exists is None:
                raise HTTPException(status_code=404, detail="Document type not found.")
            submission.document_type_id = doc_type_uuid
        except ValueError:
            pass

    if body.replace_submission_id:
        try:
            replace_uuid = UUID(body.replace_submission_id)
            old_sub_result = await db.execute(
                select(DocumentSubmission)
                .options(selectinload(DocumentSubmission.document_type))
                .where(DocumentSubmission.id == replace_uuid)
            )
            old_sub = old_sub_result.scalar_one_or_none()
            if old_sub is not None and old_sub.student_id == student.id:
                if old_sub.document_type_id is not None:
                    if await has_verified_submission(
                        db, student.id, old_sub.document_type_id, exclude_submission_id=old_sub.id
                    ):
                        doc_type = old_sub.document_type
                        type_name = doc_type.name if doc_type else "that type"
                        raise HTTPException(
                            status_code=409,
                            detail=f"'{type_name}' is already verified and cannot be re-uploaded.",
                        )
                submission.parent_submission_id = replace_uuid
        except ValueError:
            pass

    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return InitiateUploadResponse(
        submission_id=str(submission.id),
        url=presigned["url"],
        fields=presigned["fields"],
        key=key,
    )


@router.post("/api/me/documents/{submission_id}/retry", response_model=InitiateUploadResponse)
async def retry_upload(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
    body: RetryUploadRequest | None = None,
) -> InitiateUploadResponse:
    """Generate a fresh presigned POST URL for an existing PENDING submission.

    Used when an upload was initiated but the browser never completed the GCS POST
    (e.g., user closed the tab, network failed). The file_key stays the same;
    only the presigned URL is refreshed so the browser can retry the upload.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

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
    """Verify the file exists in GCS and mark the submission as UPLOADED.

    This endpoint is called by the browser after it has successfully POSTed the
    file to the presigned GCS URL returned by /api/me/documents/initiate.
    Classification is triggered separately via the /classify endpoint.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

    try:
        submission_id = UUID(body.submission_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid submission id.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to confirm this document.")

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


def _serialize_submission(
    s,
    children: list | None = None,
) -> SubmissionDetailResponse:
    return SubmissionDetailResponse(
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
        rejection_reason=s.rejection_reason,
        document_type_code=s.document_type.code if s.document_type else None,
        parent_submission_id=str(s.parent_submission_id) if s.parent_submission_id else None,
        page_range=s.page_range,
        segment_index=s.segment_index,
        is_compiled_parent=bool(s.is_compiled_parent),
        page_count=s.page_count,
        children=[_serialize_submission(c) for c in (children or [])],
        created_at=s.created_at.isoformat() if s.created_at else "",
    )


@router.get("/api/me/documents", response_model=list[SubmissionDetailResponse])
async def list_my_documents(
    current_user: StudentClaims,
    db: SessionDep,
) -> list[SubmissionDetailResponse]:
    """Return document submissions for the current student, excluding replaced ones."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        return []

    replacement = aliased(DocumentSubmission)
    db_result = await db.execute(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .outerjoin(
            replacement,
            (replacement.parent_submission_id == DocumentSubmission.id)
            & (replacement.student_id == student.id),
        )
        .where(
            DocumentSubmission.student_id == student.id,
            or_(
                replacement.id.is_(None),
                DocumentSubmission.is_compiled_parent.is_(True),
            ),
        )
        .order_by(desc(DocumentSubmission.created_at))
        .distinct()
    )
    submissions = db_result.scalars().all()

    compiled_parent_ids = {s.id for s in submissions if s.is_compiled_parent}
    children_by_parent: dict = {}
    flat: list = []
    for s in submissions:
        if s.parent_submission_id in compiled_parent_ids:
            children_by_parent.setdefault(s.parent_submission_id, []).append(s)
        else:
            flat.append(s)

    # Compiled segments share a timestamp; order them by segment_index so pages
    # render in document order instead of reversed by DB row order.
    for children in children_by_parent.values():
        children.sort(key=lambda c: c.segment_index if c.segment_index is not None else 0)

    return [
        _serialize_submission(s, children_by_parent.get(s.id))
        for s in flat
        # Compiled parents with no remaining children are omitted so an
        # orphaned, undeletable parent container never reaches the client.
        if not (s.is_compiled_parent and s.id not in children_by_parent)
    ]


@router.post("/api/me/documents/submit-batch", response_model=SubmitBatchResponse)
async def submit_batch(
    current_user: StudentClaims,
    db: SessionDep,
    body: SubmitBatchRequest | None = None,
) -> SubmitBatchResponse:
    """Advance all classified/flagged submissions to SUBMITTED status.

    Called from the Step 4 review screen when the student clicks
    "Submit All Documents". Locks the documents so they cannot be
    edited or re-uploaded while the adviser reviews them.

    Skips any submission whose document type is already verified by
    another active submission, cleaning up the transient DB row and
    GCS file to prevent duplicates.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

    stmt = exclude_replaced_submissions(
        select(DocumentSubmission)
        .options(selectinload(DocumentSubmission.document_type))
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_([
                SubmissionStatus.CLASSIFIED,
                SubmissionStatus.FLAGGED,
            ]),
            DocumentSubmission.is_compiled_parent.is_(False),
        )
    )

    if body and body.submission_ids:
        try:
            ids = [UUID(rid) for rid in body.submission_ids]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid submission id in body.")
        stmt = stmt.where(DocumentSubmission.id.in_(ids))

    result = await db.execute(stmt)
    submissions = list(result.scalars().all())

    # Deduplicate by document_type_id — keep only the newest per type.
    # Catches uploads from the general upload page where parent_submission_id
    # was not set, causing both the old FLAGGED and new CLASSIFIED copies to
    # pass the query filter.
    dups_to_remove: list[DocumentSubmission] = []
    gcs_keys_to_cleanup: list[str] = []

    kept = latest_submission_per_type(submissions)
    latest_map = {s.document_type_id: s for s in kept if s.document_type_id is not None}
    kept_ids = {s.id for s in kept}

    for sub in submissions:
        if sub.id in kept_ids or sub.document_type_id is None:
            continue

        new_sub = latest_map.get(sub.document_type_id)
        if new_sub is None:
            continue

        if sub.status == SubmissionStatus.FLAGGED:
            # Preserve the flagged record — link lineage instead of deleting.
            # exclude_replaced_submissions will hide it from adviser views.
            #
            # Only link lineage when the newer submission is not already a
            # compiled child (which uses parent_submission_id to point at its
            # compiled container). Overwriting that field would orphan the
            # child from its split parent. Already-linked submissions are
            # treated like classified duplicates and cleaned up instead.
            if new_sub.parent_submission_id is None:
                new_sub.parent_submission_id = sub.id
                flag_reason = sub.rejection_reason
                flag_actor = sub.flagged_by if sub.flagged_by else student.user_id
                db.add(DocumentSubmissionHistory(
                    submission_id=sub.id,
                    actor_user_id=flag_actor,
                    action="REUPLOADED",
                    previous_status=SubmissionStatus.FLAGGED.value,
                    new_status=SubmissionStatus.FLAGGED.value,
                    reference_submission_id=new_sub.id,
                    reason=flag_reason,
                ))
                db.add(DocumentSubmissionHistory(
                    submission_id=new_sub.id,
                    actor_user_id=flag_actor,
                    action="REPLACEMENT_OF",
                    previous_status=SubmissionStatus.CLASSIFIED.value,
                    new_status=SubmissionStatus.SUBMITTED.value,
                    reference_submission_id=sub.id,
                    reason=flag_reason,
                ))
            else:
                # Compiled child or otherwise linked: drop the old flagged dup.
                dups_to_remove.append(sub)
        else:
            # CLASSIFIED duplicate from this batch — safe to hard-delete
            dups_to_remove.append(sub)

    for dup in dups_to_remove:
        if dup.file_key:
            gcs_keys_to_cleanup.append(dup.file_key)
        await db.delete(dup)

    submissions = kept

    if not submissions:
        raise HTTPException(
            status_code=400,
            detail="No documents ready for submission.",
        )

    verified_stmt = select(DocumentSubmission.document_type_id).where(
        DocumentSubmission.student_id == student.id,
        DocumentSubmission.status == SubmissionStatus.VERIFIED,
    )
    verified_type_ids = set(
        (await db.execute(verified_stmt)).scalars().all()
    )

    to_skip: list[DocumentSubmission] = []
    to_submit: list[DocumentSubmission] = []
    for sub in submissions:
        if sub.document_type_id is not None and sub.document_type_id in verified_type_ids:
            to_skip.append(sub)
        else:
            to_submit.append(sub)

    skipped_details: list[dict] = []
    for sub in to_skip:
        doc_type_name = sub.document_type.name if sub.document_type else None
        skipped_details.append({
            "submission_id": str(sub.id),
            "document_type_name": doc_type_name,
            "reason": "already verified",
        })
        if sub.file_key:
            gcs_keys_to_cleanup.append(sub.file_key)
        await db.delete(sub)

    for sub in to_submit:
        previous_status = sub.status.value
        sub.status = SubmissionStatus.SUBMITTED
        db.add(
            DocumentSubmissionHistory(
                submission_id=sub.id,
                actor_user_id=student.user_id,
                action="SUBMITTED",
                previous_status=previous_status,
                new_status=SubmissionStatus.SUBMITTED.value,
            )
        )
        if sub.parent_submission_id is not None:
            old_sub = await db.get(DocumentSubmission, sub.parent_submission_id)
            # Compiled-PDF child (Feature 3): the parent is the split container,
            # not a replaced duplicate — skip replacement lineage history.
            if old_sub is not None and old_sub.is_compiled_parent:
                continue
            flag_reason = old_sub.rejection_reason if old_sub else None
            flag_actor = (old_sub.flagged_by if old_sub and old_sub.flagged_by
                          else student.user_id)

            db.add(
                DocumentSubmissionHistory(
                    submission_id=sub.parent_submission_id,
                    actor_user_id=flag_actor,
                    action="REUPLOADED",
                    previous_status=SubmissionStatus.FLAGGED.value,
                    new_status=SubmissionStatus.FLAGGED.value,
                    reference_submission_id=sub.id,
                    reason=flag_reason,
                )
            )
            db.add(
                DocumentSubmissionHistory(
                    submission_id=sub.id,
                    actor_user_id=flag_actor,
                    action="REPLACEMENT_OF",
                    previous_status=SubmissionStatus.FLAGGED.value,
                    new_status=SubmissionStatus.SUBMITTED.value,
                    reference_submission_id=sub.parent_submission_id,
                    reason=flag_reason,
                )
            )

    slot_statuses = await get_student_slot_statuses(db, student)
    incomplete_slots = [s for s in slot_statuses if not s.is_complete]
    student.application_status = "PENDING_DOCUMENTS" if incomplete_slots or not slot_statuses else "SUBMITTED_COMPLETE"
    db.add(student)

    await db.commit()

    for file_key in gcs_keys_to_cleanup:
        try:
            await asyncio.to_thread(gcs_delete_file, file_key)
        except Exception:
            logger.exception("Failed to delete GCS file %s after successful commit", file_key)

    return SubmitBatchResponse(
        status="success",
        submitted_count=len(to_submit),
        skipped_count=len(to_skip),
        skipped=skipped_details,
        application_status=student.application_status,
        incomplete_slots=[
            IncompleteSlotMetadata(
                id=str(s.id),
                name=s.group_name or s.description or (s.items[0].document_type_name if s.items else "Untitled slot"),
                min_required=s.min_required,
            )
            for s in incomplete_slots
        ],
    )


@router.delete("/api/me/documents/{submission_id}")
async def delete_document(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    """Delete a document submission from both the database and GCS storage.

    Only allows deletion of non-verified documents (uploaded, processing, flagged, etc.).
    Verified documents are protected from deletion to preserve audit integrity.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:

        raise HTTPException(status_code=403, detail="You do not have permission to delete this document.")

    if submission.status in DELETE_LOCKED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a document that is being processed, submitted, or verified.",
        )

    # Collect GCS keys first, but delete them only after the DB transaction
    # commits. Deleting files before commit risks leaving DB rows pointing at
    # deleted objects if the transaction later fails (lock timeout, integrity
    # error), producing broken references.
    keys_to_delete: list[str] = [submission.file_key]

    # Deleting a compiled parent cascades to its child segments (and their GCS
    # files) so the whole container is removed atomically instead of orphaning
    # the segments (their parent_submission_id would otherwise be SET NULL and
    # lose their grouping/page-range context). Segments that have already been
    # submitted or verified are locked and block the entire delete.
    if getattr(submission, "is_compiled_parent", False):
        # Lock the child rows FOR UPDATE so a concurrent submit_batch cannot
        # flip a segment CLASSIFIED -> SUBMITTED between this read and the
        # delete below (which would silently remove a just-submitted segment).
        children_result = await db.execute(
            select(DocumentSubmission)
            .where(DocumentSubmission.parent_submission_id == submission.id)
            .with_for_update()
        )
        children = list(children_result.scalars().all())
        locked = [
            c for c in children
            if c.status in DELETE_LOCKED_STATUSES
        ]
        if locked:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete a compiled document that has segments being processed, submitted, in review, or verified.",
            )
        for child in children:
            if child.file_key:
                keys_to_delete.append(child.file_key)
            await db.delete(child)

    # Compiled-PDF cascade: if this submission was the last child of a compiled
    # parent, delete the now-empty parent container too so it does not linger as
    # an undeletable orphan in the UI or the database.
    parent_id = submission.parent_submission_id

    await db.delete(submission)
    await db.flush()

    if parent_id is not None:
        parent = await db.get(DocumentSubmission, parent_id)
        if (
            parent is not None
            and parent.is_compiled_parent
            and parent.student_id == student.id
        ):
            remaining = await db.execute(
                select(DocumentSubmission.id).where(
                    DocumentSubmission.parent_submission_id == parent_id
                )
            )
            if remaining.first() is None:
                if parent.file_key:
                    keys_to_delete.append(parent.file_key)
                await db.delete(parent)

    await db.commit()

    for file_key in keys_to_delete:
        try:
            await asyncio.to_thread(gcs_delete_file, file_key)
        except Exception:
            logger.exception("Failed to delete GCS file %s after successful commit", file_key)

    return {"ok": True}


@router.post("/api/me/documents/{submission_id}/resolve-duplicate")
async def resolve_duplicate(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> dict:
    """Delete a duplicate submission that exceeds the slot's min_required.

    Only allows deletion of non-verified documents. Adds a history entry
    documenting the resolution.
    """
    student = await _require_student_onboarded(db, current_user)
    await _ensure_school_year_not_closed(db, student)

    # Lock the submission row for the duration of this transaction. This
    # prevents a race where an adviser verifies the document after the status
    # check below but before the delete, which would silently remove a verified
    # submission. The adviser verify path also locks the row (with_for_update),
    # so the two operations serialize instead of interleaving.
    submission_result = await db.execute(
        select(DocumentSubmission)
        .where(DocumentSubmission.id == submission_id)
        .with_for_update()
    )
    submission = submission_result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    if submission.student_id != student.id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to resolve this document.",
        )

    if submission.status in (
        SubmissionStatus.VERIFIED,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
    ):
        raise HTTPException(
            status_code=409,
            detail="Cannot resolve a document that has been submitted or verified.",
        )

    history = DocumentSubmissionHistory(
        submission_id=submission.id,
        action="duplicate_resolved",
        reason="Student removed duplicate submission",
        actor_user_id=student.user_id,
    )
    db.add(history)

    await db.delete(submission)
    await db.commit()

    try:
        await asyncio.to_thread(gcs_delete_file, submission.file_key)
    except Exception:
        logger.warning("GCS file already missing or failed to delete: %s", submission.file_key)

    return {"ok": True, "deleted_id": str(submission_id)}


@router.get("/api/me/documents/{submission_id}/download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> DownloadUrlResponse:
    """Return a presigned GET URL for viewing a previously uploaded document.

    The URL is only generated for submissions that have actually arrived in GCS
    (UPLOADED, FLAGGED, CLASSIFIED, PROCESSING, SUBMITTED, or IN_REVIEW). PENDING
    submissions are rejected because the file may not be present yet.
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

    if submission.status not in (
        SubmissionStatus.UPLOADED,
        SubmissionStatus.FLAGGED,
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.PROCESSING,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
        SubmissionStatus.VERIFIED,
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Document is not ready for preview (status: {submission.status.value}).",
        )

    url = gcs_generate_presigned_url(submission.file_key)
    return DownloadUrlResponse(url=url, expires_in=3600)


class SubmissionHistoryEntryResponse(BaseModel):
    id: str
    action: str
    actor_name: str | None = None
    previous_status: str | None = None
    new_status: str | None = None
    reason: str | None = None
    reference_submission_id: str | None = None
    created_at: str


@router.get("/api/me/documents/{submission_id}/history", response_model=list[SubmissionHistoryEntryResponse])
async def get_submission_history(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> list[SubmissionHistoryEntryResponse]:
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

    db_result = await db.execute(
        select(DocumentSubmissionHistory, User)
        .outerjoin(User, DocumentSubmissionHistory.actor_user_id == User.id)
        .where(DocumentSubmissionHistory.submission_id == submission_id)
        .order_by(DocumentSubmissionHistory.created_at)
    )
    rows = db_result.all()

    result_entries = []
    for history, user_obj in rows:
        reason = history.reason
        if history.action in ("REPLACEMENT_OF", "REUPLOADED") and history.reference_submission_id:
            ref_sub = await db.get(DocumentSubmission, history.reference_submission_id)
            if ref_sub and ref_sub.rejection_reason:
                reason = ref_sub.rejection_reason

        result_entries.append(SubmissionHistoryEntryResponse(
            id=str(history.id),
            action=history.action,
            actor_name=f"{user_obj.first_name} {user_obj.last_name}".strip() if user_obj else None,
            previous_status=history.previous_status,
            new_status=history.new_status,
            reason=reason,
            reference_submission_id=str(history.reference_submission_id) if history.reference_submission_id else None,
            created_at=history.created_at.isoformat() if history.created_at else "",
        ))

    return result_entries
