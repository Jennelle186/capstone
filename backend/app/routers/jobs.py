import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..database import SessionDep
from ..models import (
    DocumentSubmission,
    Job,
    JobSubmission,
    JobSubmissionItemStatus,
    Student,
    SubmissionStatus,
)
from ..schemas.jobs import JobCreate, JobListResponse, JobResponse, JobSubmissionResponse, RetryResponse
from ..services.job_queue import create_job, duplicate_check
from ..services.user_sync import ensure_user_row
from .documents.schemas import StudentClaims

logger = logging.getLogger(__name__)

router = APIRouter(tags=["jobs"])


def _job_to_response(job: Job) -> JobResponse:
    submissions = []
    if job.submissions:
        submissions = [
            JobSubmissionResponse(
                submission_id=str(js.submission_id),
                status=js.status.value if js.status else None,
                error_message=js.error_message,
            )
            for js in job.submissions
        ]
    return JobResponse(
        id=str(job.id),
        student_id=str(job.student_id),
        operation=job.operation,
        status=job.status.value if job.status else "",
        result=job.result.value if job.result else None,
        progress=job.progress or 0,
        total=job.total or 0,
        error_message=job.error_message,
        attempt_number=job.attempt_number or 1,
        parent_job_id=str(job.parent_job_id) if job.parent_job_id else None,
        created_at=job.created_at.isoformat() if job.created_at else "",
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        last_updated_at=job.last_updated_at.isoformat() if job.last_updated_at else "",
        submissions=submissions,
    )


def _eligible_statuses_for_operation(operation: str) -> tuple:
    """Return the submission statuses that are eligible for a given operation."""
    if operation == "classify":
        return (SubmissionStatus.UPLOADED, SubmissionStatus.FLAGGED)
    elif operation == "extract":
        return (SubmissionStatus.CLASSIFIED, SubmissionStatus.FLAGGED)
    return ()


@router.post("/api/me/jobs", status_code=201)
async def start_job(
    body: JobCreate,
    current_user: StudentClaims,
    db: SessionDep,
):
    """Create a new AI operation job.

    Returns 201 with the created job, or 409 if an active job already
    exists for this student and operation.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    # Validate operation
    valid_ops = {"classify", "extract"}
    if body.operation not in valid_ops:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid operation '{body.operation}'. Must be one of: {', '.join(sorted(valid_ops))}.",
        )

    # Parse and validate submission IDs
    submission_ids: list[UUID] = []
    for raw_id in body.submission_ids:
        try:
            submission_ids.append(UUID(raw_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid submission id: {raw_id}",
            ) from exc

    eligible_statuses = _eligible_statuses_for_operation(body.operation)

    if not submission_ids:
        # Auto-collect all eligible submissions for this student
        filters = [
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_(eligible_statuses),
        ]
        if body.operation == "extract":
            filters.append(DocumentSubmission.extracted_data.is_(None))
        subs_result = await db.execute(
            select(DocumentSubmission).where(*filters)
        )
        submissions = list(subs_result.scalars().all())
        if not submissions:
            raise HTTPException(status_code=400, detail="No eligible submissions found.")
        submission_ids = [s.id for s in submissions]
    else:
        # Verify ownership and eligibility
        subs_result = await db.execute(
            select(DocumentSubmission).where(DocumentSubmission.id.in_(submission_ids))
        )
        submissions = list(subs_result.scalars().all())

        if len(submissions) != len(submission_ids):
            raise HTTPException(status_code=404, detail="One or more submissions not found.")

        for sub in submissions:
            if sub.student_id != student.id:
                raise HTTPException(status_code=403, detail="You do not have permission to process one or more submissions.")
            if eligible_statuses and sub.status not in eligible_statuses:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot {body.operation} a submission with status '{sub.status.value}'.",
                )

    # Duplicate check: only one active job per (student, operation)
    existing = await duplicate_check(db, student.id, body.operation)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"An active {body.operation} job is already in progress.",
        )

    # Create the job
    job = await create_job(
        db,
        student_id=student.id,
        operation=body.operation,
        submission_ids=submission_ids,
        requested_by=user.id,
    )

    # Eager-load submissions for the response
    await db.refresh(job, ["submissions"])

    return _job_to_response(job)


@router.get("/api/me/jobs", response_model=JobListResponse)
async def list_jobs(
    current_user: StudentClaims,
    db: SessionDep,
    status: str | None = None,
):
    """List jobs for the current student.

    If `status=active`, returns only queued and running jobs.
    Otherwise returns all jobs.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        return JobListResponse(jobs=[])

    from ..models import JobStatus

    query = select(Job).where(Job.student_id == student.id)

    if status == "active":
        query = query.where(
            Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING])
        )

    query = query.order_by(Job.created_at.desc())
    jobs_result = await db.execute(query)
    jobs = list(jobs_result.scalars().all())

    # Eager-load submissions per job
    for job in jobs:
        await db.refresh(job, ["submissions"])

    return JobListResponse(jobs=[_job_to_response(j) for j in jobs])


@router.get("/api/me/jobs/{job_id}")
async def get_job(
    job_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
):
    """Get a single job with its per-submission statuses."""
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this job.")

    await db.refresh(job, ["submissions"])

    return _job_to_response(job)


@router.post("/api/me/jobs/{job_id}/retry", status_code=201)
async def retry_job(
    job_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
):
    """Retry a failed job. Creates a new job containing only the
    submissions that failed in the original job.
    """
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=400, detail="Student profile not found.")

    original_job = await db.get(Job, job_id)
    if original_job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if original_job.student_id != student.id:
        raise HTTPException(status_code=403, detail="You do not have permission to retry this job.")

    if original_job.status.value != "finished" or original_job.result != "failed" and original_job.result != "partial_success":
        # Allow retry of finished jobs that had failures
        pass

    if not (original_job.result in ("failed", "partial_success") or original_job.status.value == "failed"):
        raise HTTPException(
            status_code=409,
            detail="Only failed or partially successful jobs can be retried.",
        )

    # Find failed submissions from the original job
    await db.refresh(original_job, ["submissions"])
    failed_ids = [
        js.submission_id
        for js in original_job.submissions
        if js.status == JobSubmissionItemStatus.FAILED
    ]

    if not failed_ids:
        raise HTTPException(status_code=409, detail="No failed submissions found to retry.")

    # Duplicate check
    existing = await duplicate_check(db, student.id, original_job.operation)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"An active {original_job.operation} job is already in progress.",
        )

    new_job = await create_job(
        db,
        student_id=student.id,
        operation=original_job.operation,
        submission_ids=failed_ids,
        requested_by=user.id,
        parent_job_id=original_job.id,
        attempt_number=(original_job.attempt_number or 1) + 1,
    )

    await db.refresh(new_job, ["submissions"])

    return RetryResponse(job=_job_to_response(new_job))
