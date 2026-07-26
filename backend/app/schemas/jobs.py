from pydantic import BaseModel
from uuid import UUID


class JobSubmissionResponse(BaseModel):
    submission_id: str
    status: str | None = None
    error_message: str | None = None


class JobResponse(BaseModel):
    id: str
    student_id: str
    operation: str
    status: str
    result: str | None = None
    progress: int
    total: int
    error_message: str | None = None
    attempt_number: int = 1
    parent_job_id: str | None = None
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    last_updated_at: str
    submissions: list[JobSubmissionResponse] = []


class JobListResponse(BaseModel):
    jobs: list[JobResponse]


class JobCreate(BaseModel):
    operation: str
    submission_ids: list[str] = []


class RetryResponse(BaseModel):
    job: JobResponse
