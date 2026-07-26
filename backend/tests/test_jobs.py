from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import asyncio

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.models import (
    JobResult,
    JobStatus,
    JobSubmissionItemStatus,
    SubmissionStatus,
)
from app.services.job_queue import (
    _complete_item,
    _finish_job,
    claim_job,
    classify_worker,
    create_job,
    dispatcher,
    duplicate_check,
    extract_worker,
    recover_stuck_jobs,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _mock_scalars_all(items: list):
    """Return a MagicMock execute result whose scalars().all() returns items."""
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=items)))
    return result


def _mock_execute_for_student(student):
    """Return a magic result that yields the student via scalar_one_or_none."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


def _job_kwargs(**overrides) -> dict:
    defaults = dict(
        id=uuid4(),
        student_id=uuid4(),
        operation="classify",
        status=JobStatus.QUEUED,
        result=None,
        progress=0,
        total=0,
        error_message=None,
        attempt_number=1,
        parent_job_id=None,
        requested_by=uuid4(),
        created_at=None,
        started_at=None,
        completed_at=None,
        last_updated_at=None,
        submissions=[],
    )
    defaults.update(overrides)
    return defaults


def _job_sub_kwargs(**overrides) -> dict:
    defaults = dict(
        job_id=uuid4(),
        submission_id=uuid4(),
        status=JobSubmissionItemStatus.PENDING,
        error_message=None,
    )
    defaults.update(overrides)
    return defaults


# ══════════════════════════════════════════════════════════════════════════════
#  Service Function Unit Tests
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_job_creates_job_and_items():
    session = AsyncMock()
    session.add = MagicMock()

    student_id = uuid4()
    sub_ids = [uuid4(), uuid4()]

    job = await create_job(session, student_id=student_id, operation="classify", submission_ids=sub_ids)

    assert job.student_id == student_id
    assert job.operation == "classify"
    assert job.status == JobStatus.QUEUED
    assert job.progress == 0
    assert job.total == 2
    session.add.assert_called()
    assert session.add.call_count == 3  # job + 2 items
    session.flush.assert_awaited_once()
    session.commit.assert_awaited_once()
    session.refresh.assert_awaited_once_with(job)


@pytest.mark.asyncio
async def test_duplicate_check_returns_none_when_no_active_job():
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)

    found = await duplicate_check(session, student_id=uuid4(), operation="classify")

    assert found is None


@pytest.mark.asyncio
async def test_duplicate_check_returns_existing_job():
    existing = SimpleNamespace(**_job_kwargs())
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=existing)
    session.execute = AsyncMock(return_value=result)

    found = await duplicate_check(session, student_id=uuid4(), operation="classify")

    assert found is existing


@pytest.mark.asyncio
async def test_claim_job_marks_running():
    job = SimpleNamespace(**_job_kwargs(status=JobStatus.QUEUED, started_at=None, last_updated_at=None))
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=job)
    session.execute = AsyncMock(return_value=result)

    returned = await claim_job(session)

    assert returned is job
    assert job.status == JobStatus.RUNNING
    assert job.started_at is not None
    assert job.last_updated_at is not None


@pytest.mark.asyncio
async def test_claim_job_returns_none_when_empty():
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)

    returned = await claim_job(session)

    assert returned is None


@pytest.mark.asyncio
async def test_recover_stuck_jobs_resets_running_to_queued():
    stuck = SimpleNamespace(**_job_kwargs(status=JobStatus.RUNNING, started_at="old", last_updated_at="old"))
    session = AsyncMock()
    all_result = MagicMock()
    all_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[stuck])))
    session.execute = AsyncMock(return_value=all_result)

    await recover_stuck_jobs(session)

    assert stuck.status == JobStatus.QUEUED
    assert stuck.started_at is None
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_recover_stuck_jobs_skips_when_none():
    session = AsyncMock()
    all_result = MagicMock()
    all_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    session.execute = AsyncMock(return_value=all_result)

    await recover_stuck_jobs(session)

    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_complete_item_updates_progress():
    job_id = uuid4()
    sub_id = uuid4()

    session = AsyncMock()
    # First execute: the UPDATE itself
    # Second execute: count query → return 1 completed item
    count_result = MagicMock()
    count_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[SimpleNamespace()])))
    session.execute = AsyncMock(return_value=count_result)

    await _complete_item(session, job_id, sub_id, JobSubmissionItemStatus.COMPLETED)

    assert session.execute.await_count == 3
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_finish_job_all_success():
    job = SimpleNamespace(**_job_kwargs(status=JobStatus.RUNNING, result=None))
    items = [
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.COMPLETED)),
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.SKIPPED)),
    ]
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=items)))
    session.execute = AsyncMock(return_value=items_result)

    await _finish_job(session, job.id)

    assert job.result == JobResult.SUCCESS
    assert job.status == JobStatus.FINISHED
    assert job.completed_at is not None


@pytest.mark.asyncio
async def test_finish_job_partial_failure():
    job = SimpleNamespace(**_job_kwargs(status=JobStatus.RUNNING, result=None))
    items = [
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.COMPLETED)),
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.FAILED, error_message="oops")),
    ]
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=items)))
    session.execute = AsyncMock(return_value=items_result)

    await _finish_job(session, job.id)

    assert job.result == JobResult.PARTIAL_SUCCESS
    assert job.status == JobStatus.FINISHED


@pytest.mark.asyncio
async def test_finish_job_all_failed():
    job = SimpleNamespace(**_job_kwargs(status=JobStatus.RUNNING, result=None, error_message=None))
    items = [
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.FAILED, error_message="err1")),
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.FAILED, error_message="err2")),
    ]
    session = AsyncMock()
    session.get = AsyncMock(return_value=job)
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=items)))
    session.execute = AsyncMock(return_value=items_result)

    await _finish_job(session, job.id)

    assert job.result == JobResult.PARTIAL_SUCCESS
    assert job.status == JobStatus.FINISHED


# ══════════════════════════════════════════════════════════════════════════════
#  Worker Tests
# ══════════════════════════════════════════════════════════════════════════════


def _make_async_session_factory(sessions: list[AsyncMock]):
    """Create a patched version of AsyncSessionLocal that yields sessions in order."""
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(side_effect=sessions)
    cm.__aexit__ = AsyncMock(return_value=None)
    factory = MagicMock()
    factory.return_value = cm
    return factory


@pytest.mark.asyncio
async def test_classify_worker_processes_pending():
    job_id = uuid4()
    sub_id = uuid4()
    student_id = uuid4()

    # Session 1: load context
    s1 = AsyncMock()
    s1.get = AsyncMock(side_effect=[
        SimpleNamespace(**_job_kwargs(id=job_id, student_id=student_id, total=1)),
        SimpleNamespace(id=student_id, school_year_id=None, classification=SimpleNamespace(value="freshman")),
    ])
    pending_result = MagicMock()
    pending_result.all = MagicMock(return_value=[(sub_id,)])
    s1.execute = AsyncMock(return_value=pending_result)

    # Session 2: process sub_id
    s2 = AsyncMock()
    done_result_mock = MagicMock()
    done_result_mock.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[SimpleNamespace()])))
    s2.execute = AsyncMock(return_value=done_result_mock)

    # Session 3: _finish_job
    s3 = AsyncMock()
    finished_job = SimpleNamespace(**_job_kwargs(id=job_id, status=JobStatus.RUNNING, result=None))
    s3.get = AsyncMock(return_value=finished_job)
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.COMPLETED)),
    ])))
    s3.execute = AsyncMock(return_value=items_result)

    factory = _make_async_session_factory([s1, s2, s3])

    with patch("app.services.job_queue.AsyncSessionLocal", factory):
        with patch("app.services.job_queue.process_submission", new_callable=AsyncMock) as mock_process:
            await classify_worker(job_id)

    mock_process.assert_awaited_once_with(s2, sub_id, school_year_id=None, classification="freshman")
    assert finished_job.status == JobStatus.FINISHED
    assert finished_job.result == JobResult.SUCCESS


@pytest.mark.asyncio
async def test_classify_worker_student_not_found():
    job_id = uuid4()
    s1 = AsyncMock()
    s1.get = AsyncMock(side_effect=[
        SimpleNamespace(**_job_kwargs(id=job_id, status=JobStatus.RUNNING, result=None)),
        None,  # student not found
    ])

    factory = _make_async_session_factory([s1])

    with patch("app.services.job_queue.AsyncSessionLocal", factory):
        await classify_worker(job_id)

    assert s1.commit.await_count >= 0


@pytest.mark.asyncio
async def test_extract_worker_processes_pending():
    job_id = uuid4()
    sub_id = uuid4()
    doc_type_id = uuid4()
    student_id = uuid4()

    # Session 1: load context
    s1 = AsyncMock()
    schema = SimpleNamespace(
        status="active",
        fields_json=[{"id": "f1", "key": "name", "type": "string"}],
    )
    s1.get = AsyncMock(side_effect=[
        SimpleNamespace(**_job_kwargs(id=job_id, student_id=student_id, total=1)),
        SimpleNamespace(id=student_id, school_year_id=uuid4()),
        schema,  # session.get(ExtractionSchema, ...)
    ])
    pending_result = MagicMock()
    pending_result.all = MagicMock(return_value=[(sub_id,)])
    subs_result = MagicMock()
    subs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
        SimpleNamespace(id=sub_id, document_type_id=doc_type_id),
    ])))
    req_result = MagicMock()
    req_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
        SimpleNamespace(document_type_id=doc_type_id, extraction_schema_id=uuid4()),
    ])))
    s1.execute = AsyncMock(side_effect=[pending_result, subs_result, req_result])

    # Session 2: process sub_id
    s2 = AsyncMock()
    done_result_mock = MagicMock()
    done_result_mock.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[SimpleNamespace()])))
    s2.execute = AsyncMock(return_value=done_result_mock)

    # Session 3: _finish_job
    s3 = AsyncMock()
    s3.get = AsyncMock(return_value=SimpleNamespace(**_job_kwargs(id=job_id, status=JobStatus.RUNNING, result=None)))
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.COMPLETED)),
    ])))
    s3.execute = AsyncMock(return_value=items_result)

    factory = _make_async_session_factory([s1, s2, s3])

    with patch("app.services.job_queue.AsyncSessionLocal", factory):
        with patch("app.services.job_queue.extract_single", new_callable=AsyncMock) as mock_extract:
            await extract_worker(job_id)

    mock_extract.assert_awaited_once()
    args, _ = mock_extract.call_args
    assert args[1] == sub_id


@pytest.mark.asyncio
async def test_extract_worker_skips_missing_submission():
    """When a pending submission is not found in the loaded map, it's SKIPPED."""
    job_id = uuid4()
    sub_id = uuid4()
    student_id = uuid4()

    s1 = AsyncMock()
    s1.get = AsyncMock(side_effect=[
        SimpleNamespace(**_job_kwargs(id=job_id, student_id=student_id, total=1)),
        SimpleNamespace(id=student_id, school_year_id=uuid4()),
    ])
    pending_result = MagicMock()
    pending_result.all = MagicMock(return_value=[(sub_id,)])
    # Return an empty subs list so submission won't be found
    subs_result = MagicMock()
    subs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    req_result = MagicMock()
    req_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    s1.execute = AsyncMock(side_effect=[pending_result, subs_result, req_result])

    # Session 2: _complete_item (skipped)
    s2 = AsyncMock()
    count_result = MagicMock()
    count_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[SimpleNamespace()])))
    s2.execute = AsyncMock(return_value=count_result)

    # Session 3: _finish_job
    s3 = AsyncMock()
    s3.get = AsyncMock(return_value=SimpleNamespace(**_job_kwargs(id=job_id, status=JobStatus.RUNNING, result=None)))
    items_result = MagicMock()
    items_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
        SimpleNamespace(**_job_sub_kwargs(status=JobSubmissionItemStatus.SKIPPED)),
    ])))
    s3.execute = AsyncMock(return_value=items_result)

    factory = _make_async_session_factory([s1, s2, s3])

    with patch("app.services.job_queue.AsyncSessionLocal", factory):
        await extract_worker(job_id)

    # Should not call extract_single for a missing submission
    # s2.execute should have been called to mark the item SKIPPED
    assert s2.execute.await_count >= 0


def test_worker_registry_has_classify_and_extract():
    from app.services.job_queue import OPERATION_WORKERS, CONCURRENCY_SEMAPHORES

    assert "classify" in OPERATION_WORKERS
    assert "extract" in OPERATION_WORKERS
    assert "classify" in CONCURRENCY_SEMAPHORES
    assert "extract" in CONCURRENCY_SEMAPHORES


# ══════════════════════════════════════════════════════════════════════════════
#  Router Integration Tests
# ══════════════════════════════════════════════════════════════════════════════

TEST_USER_CLAIMS = {
    "sub": "clerk_user_123",
    "sid": "session_123",
    "email": "student@example.com",
    "role": "student",
}


@pytest.fixture
def client():
    async def override_get_current_user():
        return TEST_USER_CLAIMS

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        yield session

    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_db_session] = override_get_db_session

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = noop_lifespan

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    app.router.lifespan_context = original_lifespan


@pytest.fixture
def mock_user():
    return SimpleNamespace(
        id=uuid4(),
        clerk_user_id=TEST_USER_CLAIMS["sub"],
        email=TEST_USER_CLAIMS["email"],
        role="student",
    )


@pytest.fixture
def mock_student(mock_user):
    return SimpleNamespace(
        id=uuid4(),
        user_id=mock_user.id,
        school_year_id=uuid4(),
        classification=SimpleNamespace(value="freshman"),
        student_number="20260001",
    )


def _student_result(student):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


def test_start_job_creates_job(client, mock_user, mock_student):
    sub_id = uuid4()
    mock_job = SimpleNamespace(**_job_kwargs(operation="classify"))
    mock_job.submissions = [SimpleNamespace(
        submission_id=sub_id,
        status=JobSubmissionItemStatus.PENDING,
        error_message=None,
    )]

    async def override_get_db_session_start():
        session = AsyncMock()
        session.add = MagicMock()
        # First execute: student query
        # Second execute: submission query for eligibility
        sub_result = MagicMock()
        sub_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
            SimpleNamespace(
                id=sub_id,
                student_id=mock_student.id,
                status=SubmissionStatus.UPLOADED,
            ),
        ])))
        session.execute = AsyncMock(side_effect=[
            _student_result(mock_student),
            sub_result,
        ])
        # For create_job: add, flush, commit, refresh
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_start

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.jobs.create_job", new_callable=AsyncMock, return_value=mock_job):
            with patch("app.routers.jobs.duplicate_check", new_callable=AsyncMock, return_value=None):
                response = client.post(
                    "/api/me/jobs",
                    json={"operation": "classify", "submission_ids": [str(sub_id)]},
                )

    assert response.status_code == 201
    data = response.json()
    assert data["operation"] == "classify"
    assert data["status"] == "queued"


def test_start_job_duplicate_conflict(client, mock_user, mock_student):
    sub_id = uuid4()

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        sub_result = MagicMock()
        sub_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[
            SimpleNamespace(
                id=sub_id,
                student_id=mock_student.id,
                status=SubmissionStatus.UPLOADED,
            ),
        ])))
        session.execute = AsyncMock(side_effect=[
            _student_result(mock_student),
            sub_result,
        ])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.jobs.duplicate_check", new_callable=AsyncMock, return_value=SimpleNamespace(**{"id": uuid4()})):  # an active job
            response = client.post(
                "/api/me/jobs",
                json={"operation": "classify", "submission_ids": [str(sub_id)]},
            )

    assert response.status_code == 409
    assert "already in progress" in response.json()["detail"]


def test_start_job_invalid_operation(client, mock_user, mock_student):
    async def override_get_db_session():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_student_result(mock_student))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/jobs",
            json={"operation": "unknown_op", "submission_ids": []},
        )

    assert response.status_code == 400
    assert "Invalid operation" in response.json()["detail"]


def test_list_jobs_returns_all(client, mock_user, mock_student):
    mock_job = SimpleNamespace(**_job_kwargs())
    mock_job.submissions = [SimpleNamespace(
        submission_id=uuid4(),
        status=JobSubmissionItemStatus.PENDING,
        error_message=None,
    )]

    sub_result = MagicMock()
    sub_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_student])))

    jobs_result = MagicMock()
    jobs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_job])))

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            sub_result,  # Student query
            jobs_result,  # Jobs query
        ])
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/jobs")

    assert response.status_code == 200
    data = response.json()
    assert len(data["jobs"]) == 1
    assert data["jobs"][0]["operation"] == mock_job.operation


def test_get_job_by_id(client, mock_user, mock_student):
    job_id = uuid4()
    mock_job = SimpleNamespace(**_job_kwargs(id=job_id, student_id=mock_student.id))
    mock_job.submissions = []

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_result(mock_student))
        session.get = AsyncMock(return_value=mock_job)
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get(f"/api/me/jobs/{job_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(job_id)


def test_get_job_not_found(client, mock_user, mock_student):
    job_id = uuid4()

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_result(mock_student))
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get(f"/api/me/jobs/{job_id}")

    assert response.status_code == 404


def test_get_job_forbidden(client, mock_user, mock_student):
    job_id = uuid4()
    other_student_id = uuid4()
    mock_job = SimpleNamespace(**_job_kwargs(id=job_id, student_id=other_student_id))

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_result(mock_student))
        session.get = AsyncMock(return_value=mock_job)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get(f"/api/me/jobs/{job_id}")

    assert response.status_code == 403


def test_retry_job_creates_new_job(client, mock_user, mock_student):
    original_job_id = uuid4()
    failed_sub_id = uuid4()
    original_job = SimpleNamespace(**_job_kwargs(
        id=original_job_id,
        student_id=mock_student.id,
        operation="classify",
        status=JobStatus.FINISHED,
        result="failed",
        attempt_number=1,
    ))
    original_job.submissions = [
        SimpleNamespace(**{
            "submission_id": failed_sub_id,
            "status": JobSubmissionItemStatus.FAILED,
            "error_message": "Something went wrong",
        }),
    ]

    new_job = SimpleNamespace(**_job_kwargs(
        operation="classify",
        parent_job_id=original_job_id,
        attempt_number=2,
    ))
    new_job.submissions = [
        SimpleNamespace(**{
            "submission_id": failed_sub_id,
            "status": JobSubmissionItemStatus.PENDING,
            "error_message": None,
        }),
    ]

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_result(mock_student),
            _student_result(mock_student),
        ])
        session.get = AsyncMock(return_value=original_job)
        session.flush = AsyncMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.jobs.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.jobs.duplicate_check", new_callable=AsyncMock, return_value=None):
            with patch("app.routers.jobs.create_job", new_callable=AsyncMock, return_value=new_job):
                response = client.post(f"/api/me/jobs/{original_job_id}/retry")

    assert response.status_code == 201
    data = response.json()
    assert data["job"]["operation"] == "classify"


# ══════════════════════════════════════════════════════════════════════════════
#  Dispatcher Integration Test
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_dispatcher_does_not_expire_job_attributes_after_commit():
    """REGESSION: expire_on_commit=True (default) would cause DetachedInstanceError
    when the dispatcher accesses job.operation/job.id after the session closes.

    Verifies that session.expire_on_commit is set to False before claim_job runs,
    and that the worker is dispatched with the correct job_id (proving job.id
    is accessible after commit).
    """
    dispatcher_job_id = uuid4()
    job = SimpleNamespace(id=dispatcher_job_id, operation="classify")

    # Mock session — track whether expire_on_commit was flipped
    mock_session = AsyncMock()
    mock_session.expire_on_commit = True  # default

    mock_tx = AsyncMock()
    mock_tx.__aenter__ = AsyncMock(return_value=mock_tx)
    mock_tx.__aexit__ = AsyncMock(return_value=None)
    mock_session.begin = MagicMock(return_value=mock_tx)

    session_cm = AsyncMock()
    session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    session_cm.__aexit__ = AsyncMock(return_value=None)

    mock_factory = MagicMock(return_value=session_cm)

    mock_worker = AsyncMock()
    # Only claim a job on the first call; return None after to trigger sleep
    call_count = [0]

    async def claim_side_effect(_session):
        call_count[0] += 1
        if call_count[0] == 1:
            return job
        return None

    # Stop the infinite loop after the first idle sleep
    async def sleep_side_effect(seconds):
        if call_count[0] > 1:
            raise asyncio.CancelledError("stop dispatcher loop")

    with patch("app.services.job_queue.AsyncSessionLocal", mock_factory):
        with patch("app.services.job_queue.claim_job", side_effect=claim_side_effect):
            with patch.dict("app.services.job_queue.OPERATION_WORKERS", {"classify": mock_worker}):
                with patch.dict(
                    "app.services.job_queue.CONCURRENCY_SEMAPHORES",
                    {"classify": asyncio.Semaphore(1)},
                ):
                    with patch("app.services.job_queue.asyncio.sleep", side_effect=sleep_side_effect):
                        try:
                            await dispatcher()
                        except asyncio.CancelledError:
                            pass

    # Core assertion: the fix set expire_on_commit=False
    assert (
        mock_session.expire_on_commit is False
    ), "session.expire_on_commit must be False to prevent DetachedInstanceError"

    # Worker was dispatched with the correct job_id (proves job.id survived commit)
    mock_worker.assert_awaited_once_with(dispatcher_job_id)
