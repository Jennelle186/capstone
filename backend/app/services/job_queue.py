from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import (
    DocumentSubmission,
    ExtractionSchema,
    ExtractionSchemaStatus,
    Job,
    JobResult,
    JobStatus,
    JobSubmission,
    JobSubmissionItemStatus,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
)
from ..services.gcp_storage import delete_file as gcs_delete_file
from ..services.processor import process_submission
from ..services.extraction_service import extract_single
from ..services.concurrency import CLASSIFY_CONCURRENCY, EXTRACT_CONCURRENCY
from ..services.llm_observability import document_id_var, job_id_var

logger = logging.getLogger(__name__)

CLASSIFY_SEMAPHORE = asyncio.Semaphore(CLASSIFY_CONCURRENCY)
EXTRACT_SEMAPHORE = asyncio.Semaphore(EXTRACT_CONCURRENCY)

# Limit concurrent Gemini calls *within* a single classification job.
# The dispatcher semaphore limits concurrent jobs; this limits concurrent
# submissions per job so a single large job doesn’t hog all slots.
CLASSIFY_PER_JOB_SEMAPHORE = asyncio.Semaphore(max(1, CLASSIFY_CONCURRENCY // 2))

# Limit concurrent Gemini extraction calls *within* a single extraction job.
# Extraction prompts are large and slow (25–30s each), so a single student's
# batch would otherwise extract sequentially. The global EXTRACT_SEMAPHORE still
# bounds total concurrent jobs across all students, so a busy queue cannot
# oversubscribe the shared Vertex AI quota.
EXTRACT_PER_JOB_SEMAPHORE = asyncio.Semaphore(EXTRACT_CONCURRENCY)


# ── Job Creation ─────────────────────────────────────────────────────────────


async def create_job(
    session: AsyncSession,
    student_id: UUID,
    operation: str,
    submission_ids: list[UUID],
    requested_by: UUID | None = None,
    parent_job_id: UUID | None = None,
    attempt_number: int = 1,
) -> Job:
    job = Job(
        student_id=student_id,
        operation=operation,
        status=JobStatus.QUEUED,
        progress=0,
        total=len(submission_ids),
        requested_by=requested_by,
        parent_job_id=parent_job_id,
        attempt_number=attempt_number,
    )
    session.add(job)
    await session.flush()

    for sub_id in submission_ids:
        session.add(JobSubmission(
            job_id=job.id,
            submission_id=sub_id,
            status=JobSubmissionItemStatus.PENDING,
        ))

    await session.commit()
    await session.refresh(job)
    return job


async def duplicate_check(
    session: AsyncSession,
    student_id: UUID,
    operation: str,
) -> Job | None:
    """Return an existing active job (queued or running) for this student + operation, or None."""
    result = await session.execute(
        select(Job).where(
            Job.student_id == student_id,
            Job.operation == operation,
            Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
        ).limit(1)
    )
    return result.scalar_one_or_none()


# ── Atomic Job Claiming ──────────────────────────────────────────────────────


async def claim_job(session: AsyncSession) -> Job | None:
    """Atomically claim the next queued job using FOR UPDATE SKIP LOCKED.

    Must be called within a transaction (session.begin()). Commits the
    transaction after claiming, releasing the lock before any Gemini call.
    """
    result = await session.execute(
        select(Job)
        .where(Job.status == JobStatus.QUEUED)
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = result.scalar_one_or_none()
    if job is not None:
        job.status = JobStatus.RUNNING
        job.started_at = func_now()
        job.last_updated_at = func_now()
    return job


async def recover_stuck_jobs(session: AsyncSession) -> None:
    """On startup, reset any jobs stuck in 'running' back to 'queued'."""
    result = await session.execute(
        select(Job).where(Job.status == JobStatus.RUNNING)
    )
    stuck = list(result.scalars().all())
    for job in stuck:
        job.status = JobStatus.QUEUED
        job.started_at = None
        job.last_updated_at = func_now()
        logger.info("Recovered stuck job %s (operation=%s)", job.id, job.operation)
    if stuck:
        await session.commit()
        logger.info("Recovered %d stuck job(s)", len(stuck))


# ── Job Progress Tracking ────────────────────────────────────────────────────


async def _complete_item(
    session: AsyncSession,
    job_id: UUID,
    submission_id: UUID,
    item_status: JobSubmissionItemStatus,
    error_message: str | None = None,
) -> None:
    """Mark a single job submission item as completed/failed/skipped and update job progress."""
    await session.execute(
        update(JobSubmission)
        .where(
            JobSubmission.job_id == job_id,
            JobSubmission.submission_id == submission_id,
        )
        .values(status=item_status, error_message=error_message)
    )
    # Recalculate progress: count non-pending items
    count_result = await session.execute(
        select(JobSubmission).where(
            JobSubmission.job_id == job_id,
            JobSubmission.status.notin_([
                JobSubmissionItemStatus.PENDING,
                JobSubmissionItemStatus.RUNNING,
            ]),
        )
    )
    done_count = len(list(count_result.scalars().all()))
    await session.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(progress=done_count, last_updated_at=func_now())
    )
    await session.commit()


async def _finish_job(
    session: AsyncSession,
    job_id: UUID,
) -> None:
    """Set job status to finished and determine the result based on item outcomes."""
    job = await session.get(Job, job_id)
    if job is None:
        return

    # Load all items
    items_result = await session.execute(
        select(JobSubmission).where(JobSubmission.job_id == job_id)
    )
    items = list(items_result.scalars().all())

    all_success = len(items) > 0 and all(
        js.status in (JobSubmissionItemStatus.COMPLETED, JobSubmissionItemStatus.SKIPPED)
        for js in items
    )
    any_failed = any(js.status == JobSubmissionItemStatus.FAILED for js in items)

    if all_success:
        job.result = JobResult.SUCCESS
    elif any_failed:
        job.result = JobResult.PARTIAL_SUCCESS
    else:
        job.result = JobResult.FAILED
        # Collect error messages
        errors = [js.error_message for js in items if js.error_message]
        job.error_message = "; ".join(errors[:3]) if errors else "All items failed."

    job.status = JobStatus.FINISHED
    job.completed_at = func_now()
    job.last_updated_at = func_now()
    await session.commit()


# ── Operation Workers ────────────────────────────────────────────────────────


async def classify_worker(job_id: UUID) -> None:
    """Process a classification job: run AI on each pending submission.

    Uses direct SQL updates (not ORM) for job_submission status to avoid
    cross-session ORM object issues. Each AI call gets its own session.
    """
    # Load context in a single session
    async with AsyncSessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return

        student = await session.get(Student, job.student_id)
        if student is None:
            job.status = JobStatus.FINISHED
            job.result = JobResult.FAILED
            job.error_message = "Student not found."
            job.completed_at = func_now()
            await session.commit()
            return

        school_year_id = student.school_year_id
        classification = student.classification.value if student.classification else None

        # Get pending submission IDs (scalars, not ORM objects)
        items_result = await session.execute(
            select(JobSubmission.submission_id).where(
                JobSubmission.job_id == job_id,
                JobSubmission.status == JobSubmissionItemStatus.PENDING,
            )
        )
        pending_sub_ids = [row[0] for row in items_result.all()]

    async def _process_one(sub_id: UUID) -> None:
        # Propagate document/job context into the Gemini call sites (which only
        # receive a file_key) so observability logs can correlate each LLM call
        # with its submission and job. asyncio.to_thread copies these contextvars
        # into the worker thread.
        document_id_var.set(str(sub_id))
        job_id_var.set(str(job_id))
        async with CLASSIFY_PER_JOB_SEMAPHORE:
            async with AsyncSessionLocal() as proc_session:
                try:
                    # Mark job_submission as running using direct UPDATE
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(
                            JobSubmission.job_id == job_id,
                            JobSubmission.submission_id == sub_id,
                        )
                        .values(status=JobSubmissionItemStatus.RUNNING)
                    )
                    await proc_session.commit()

                    # Run AI classification
                    await process_submission(
                        proc_session,
                        sub_id,
                        school_year_id=school_year_id,
                        classification=classification,
                    )

                    # Mark completed
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(
                            JobSubmission.job_id == job_id,
                            JobSubmission.submission_id == sub_id,
                        )
                        .values(
                            status=JobSubmissionItemStatus.COMPLETED,
                            error_message=None,
                        )
                    )

                except HTTPException as exc:
                    logger.warning(
                        "classify_worker: submission %s returned %d - %s",
                        sub_id, exc.status_code, exc.detail,
                    )
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(
                            JobSubmission.job_id == job_id,
                            JobSubmission.submission_id == sub_id,
                        )
                        .values(
                            status=JobSubmissionItemStatus.COMPLETED,
                            error_message=exc.detail,
                        )
                    )

                except Exception as exc:
                    logger.exception(
                        "classify_worker: submission %s failed", sub_id
                    )
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(
                            JobSubmission.job_id == job_id,
                            JobSubmission.submission_id == sub_id,
                        )
                        .values(
                            status=JobSubmissionItemStatus.FAILED,
                            error_message=str(exc),
                        )
                    )

                # Update job progress (best-effort; final count is fixed by _finish_job)
                done_result = await proc_session.execute(
                    select(JobSubmission).where(
                        JobSubmission.job_id == job_id,
                        JobSubmission.status.notin_([
                            JobSubmissionItemStatus.PENDING,
                            JobSubmissionItemStatus.RUNNING,
                        ]),
                    )
                )
                done_count = len(list(done_result.scalars().all()))
                await proc_session.execute(
                    update(Job)
                    .where(Job.id == job_id)
                    .values(progress=done_count, last_updated_at=func_now())
                )
                await proc_session.commit()

    # Process submissions concurrently (up to CLASSIFY_PER_JOB_SEMAPHORE slots)
    await asyncio.gather(*[_process_one(sub_id) for sub_id in pending_sub_ids])

    # Finalize job result
    async with AsyncSessionLocal() as session:
        await _finish_job(session, job_id)


async def _resolve_extraction_schemas(
    session: AsyncSession,
    school_year_id: UUID | None,
) -> dict[UUID, list]:
    """Resolve active extraction schemas keyed by document type id.

    A document type only has an extraction schema if the student's school year
    maps it to an active (non-archived) schema with a non-empty ``fields_json``.
    Used both at job creation (to compute an accurate ``job.total``) and in the
    extract worker (to actually run extraction) so the two stay consistent.
    """
    schemas_by_type: dict[UUID, list] = {}
    if not school_year_id:
        return schemas_by_type

    req_result = await session.execute(
        select(SchoolYearRequirement).where(
            SchoolYearRequirement.school_year_id == school_year_id,
            SchoolYearRequirement.extraction_schema_id.isnot(None),
        )
    )
    for req in req_result.scalars().all():
        if not req.document_type_id:
            continue
        schema = await session.get(ExtractionSchema, req.extraction_schema_id)
        if schema and schema.status != ExtractionSchemaStatus.ARCHIVED and schema.fields_json:
            schemas_by_type[req.document_type_id] = schema.fields_json
    return schemas_by_type


async def extract_worker(job_id: UUID) -> None:
    """Process an extraction job: run AI extraction on each pending submission."""
    async with AsyncSessionLocal() as session:
        job = await session.get(Job, job_id)
        if job is None:
            return

        student = await session.get(Student, job.student_id)
        if student is None:
            job.status = JobStatus.FINISHED
            job.result = JobResult.FAILED
            job.error_message = "Student not found."
            await session.commit()
            return

        # Get pending submission IDs
        items_result = await session.execute(
            select(JobSubmission.submission_id).where(
                JobSubmission.job_id == job_id,
                JobSubmission.status == JobSubmissionItemStatus.PENDING,
            )
        )
        pending_sub_ids = [row[0] for row in items_result.all()]

        # Load submission document types to resolve schemas
        if pending_sub_ids:
            subs_result = await session.execute(
                select(DocumentSubmission).where(DocumentSubmission.id.in_(pending_sub_ids))
            )
            submissions = {s.id: s for s in subs_result.scalars().all()}
        else:
            submissions = {}

        # Resolve extraction schemas per document type (shared with job creation
        # so job.total and the worker agree on which submissions are extractable).
        schemas_by_type = await _resolve_extraction_schemas(session, student.school_year_id)

    async def _process_one(sub_id: UUID) -> None:
        # Propagate document/job context into the Gemini call sites (which only
        # receive a file_key) so observability logs can correlate each LLM call
        # with its submission and job. asyncio.to_thread copies these contextvars
        # into the worker thread.
        document_id_var.set(str(sub_id))
        job_id_var.set(str(job_id))

        submission = submissions.get(sub_id)
        if submission is None:
            async with AsyncSessionLocal() as s:
                await _complete_item(s, job_id, sub_id, JobSubmissionItemStatus.SKIPPED, "Submission not found.")
            return

        field_defs = schemas_by_type.get(submission.document_type_id) if submission.document_type_id else None
        if not field_defs:
            async with AsyncSessionLocal() as s:
                await _complete_item(s, job_id, sub_id, JobSubmissionItemStatus.SKIPPED, "No extraction schema.")
            return

        async with EXTRACT_PER_JOB_SEMAPHORE:
            async with AsyncSessionLocal() as proc_session:
                try:
                    # Mark as running
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(JobSubmission.job_id == job_id, JobSubmission.submission_id == sub_id)
                        .values(status=JobSubmissionItemStatus.RUNNING)
                    )
                    await proc_session.commit()

                    await extract_single(proc_session, sub_id, field_defs)

                    await proc_session.execute(
                        update(JobSubmission)
                        .where(JobSubmission.job_id == job_id, JobSubmission.submission_id == sub_id)
                        .values(status=JobSubmissionItemStatus.COMPLETED, error_message=None)
                    )

                except Exception as exc:
                    logger.exception("extract_worker: submission %s failed", sub_id)
                    await proc_session.execute(
                        update(JobSubmission)
                        .where(JobSubmission.job_id == job_id, JobSubmission.submission_id == sub_id)
                        .values(status=JobSubmissionItemStatus.FAILED, error_message=str(exc))
                    )

                # Update job progress (best-effort; final count is fixed by _finish_job)
                done_result = await proc_session.execute(
                    select(JobSubmission).where(
                        JobSubmission.job_id == job_id,
                        JobSubmission.status.notin_([
                            JobSubmissionItemStatus.PENDING,
                            JobSubmissionItemStatus.RUNNING,
                        ]),
                    )
                )
                done_count = len(list(done_result.scalars().all()))
                await proc_session.execute(
                    update(Job)
                    .where(Job.id == job_id)
                    .values(progress=done_count, last_updated_at=func_now())
                )
                await proc_session.commit()

    # Process submissions concurrently (up to EXTRACT_PER_JOB_SEMAPHORE slots)
    await asyncio.gather(*[_process_one(sub_id) for sub_id in pending_sub_ids])

    async with AsyncSessionLocal() as session:
        await _finish_job(session, job_id)


# ── Worker Registry ──────────────────────────────────────────────────────────


OPERATION_WORKERS = {
    "classify": classify_worker,
    "extract": extract_worker,
}

CONCURRENCY_SEMAPHORES = {
    "classify": CLASSIFY_SEMAPHORE,
    "extract": EXTRACT_SEMAPHORE,
}


async def _mark_job_failed(job_id: UUID, message: str) -> None:
    """Mark a job as FINISHED/FAILED after an unhandled worker crash.

    Without this, a fire-and-forget worker that raises (e.g. an unexpected DB
    error outside the worker's own try/except) would leave the job stuck in
    RUNNING until the next restart re-queues it. Recording the failure here
    ensures the job terminal state reflects reality immediately.
    """
    try:
        async with AsyncSessionLocal() as session:
            job = await session.get(Job, job_id)
            if job is None:
                return
            job.status = JobStatus.FINISHED
            job.result = JobResult.FAILED
            job.error_message = message
            job.completed_at = func_now()
            job.last_updated_at = func_now()
            await session.commit()
    except Exception:
        logger.exception("Failed to mark job %s as failed", job_id)


async def _bounded_worker(
    job_id: UUID,
    worker,
    semaphore: asyncio.Semaphore,
    operation: str,
) -> None:
    """Run a job worker while holding the operation's semaphore for the full
    duration.

    The semaphore is acquired *inside* this task rather than in the dispatcher
    loop. If the dispatcher wrapped `asyncio.create_task(worker(...))` in an
    ``async with semaphore`` block, the context manager would exit the moment
    the task was scheduled (create_task returns immediately), releasing the
    slot before the worker even started — making concurrency effectively
    unbounded. Acquiring the semaphore here keeps the slot held until the
    worker actually finishes.
    """
    async with semaphore:
        try:
            await worker(job_id)
        except Exception:
            logger.exception(
                "Worker crashed for job %s (operation=%s)", job_id, operation
            )
            await _mark_job_failed(job_id, "Worker crashed unexpectedly.")


async def dispatcher():
    """Main worker loop: atomically claims queued jobs and dispatches them to
    the appropriate per-operation worker pool.

    Each job is scheduled as a background task so the loop returns immediately
    to claim the next queued job, instead of blocking on ``await worker(...)``.
    Concurrency is bounded by each operation's semaphore, which is held inside
    the task (see ``_bounded_worker``) for the worker's full duration.
    """
    # Track in-flight tasks so they are not garbage-collected while running;
    # each task removes itself from the set when it completes.
    running_tasks: set[asyncio.Task] = set()

    def _discard(task: asyncio.Task) -> None:
        running_tasks.discard(task)

    while True:
        try:
            async with AsyncSessionLocal() as session:
                session.expire_on_commit = False
                async with session.begin():
                    job = await claim_job(session)
            if job is not None:
                worker = OPERATION_WORKERS.get(job.operation)
                semaphore = CONCURRENCY_SEMAPHORES.get(job.operation)
                if worker is None:
                    logger.error("No worker registered for operation: %s", job.operation)
                    async with AsyncSessionLocal() as s:
                        job_ref = await s.get(Job, job.id)
                        if job_ref:
                            job_ref.status = JobStatus.FINISHED
                            job_ref.result = JobResult.FAILED
                            job_ref.error_message = f"Unknown operation: {job.operation}"
                            job_ref.completed_at = func_now()
                            await s.commit()
                else:
                    # Fire-and-forget: schedule the bounded worker and keep
                    # looping to claim the next job without waiting.
                    task = asyncio.create_task(
                        _bounded_worker(job.id, worker, semaphore, job.operation)
                    )
                    running_tasks.add(task)
                    task.add_done_callback(_discard)
            else:
                await asyncio.sleep(1)
        except Exception:
            logger.exception("Dispatcher error — backing off 5s")
            await asyncio.sleep(5)


# ── Helper ───────────────────────────────────────────────────────────────────


def func_now():
    """Return a SQL expression for current timestamp (compatible with both sync and async)."""
    from sqlalchemy.sql import func as sqla_func
    return sqla_func.now()
