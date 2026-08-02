from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.models import JobStatus, SubmissionStatus

TEST_USER_CLAIMS = {
    "sub": "clerk_user_123",
    "sid": "session_123",
    "email": "student@example.com",
    "role": "student",
}


@pytest.fixture
def client():
    """Build a TestClient with auth, DB, and lifespan dependencies overridden."""
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
        program_id=uuid4(),
        classification=SimpleNamespace(value="freshman"),
        classification_set_by_user=True,
        student_number="20260001",
    )


def _student_execute_result(student):
    """Return a mocked execute result whose scalar_one_or_none returns the student."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


# ── classify_document ────────────────────────────────────────────────────────


def test_classify_document_creates_job(client, mock_user, mock_student):
    submission_id = uuid4()
    job_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
    )
    job = SimpleNamespace(
        id=job_id,
        operation="classify",
        status=JobStatus.QUEUED,
        progress=0,
        total=1,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            with patch(
                "app.routers.documents.classification.duplicate_check",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch(
                    "app.routers.documents.classification.create_job",
                    new_callable=AsyncMock,
                    return_value=job,
                ):
                    response = client.post(
                        f"/api/me/documents/{submission_id}/classify",
                    )

    assert response.status_code == 202
    data = response.json()
    assert data["job_id"] == str(job_id)
    assert data["operation"] == "classify"


def test_classify_document_wrong_status(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.PENDING,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            response = client.post(
                f"/api/me/documents/{submission_id}/classify",
            )

    assert response.status_code == 409


def test_classify_document_not_found(client, mock_user, mock_student):
    submission_id = uuid4()

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            response = client.post(
                f"/api/me/documents/{submission_id}/classify",
            )

    assert response.status_code == 404


def test_classify_document_wrong_student(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=uuid4(),
        status=SubmissionStatus.UPLOADED,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            response = client.post(
                f"/api/me/documents/{submission_id}/classify",
            )

    assert response.status_code == 403


def test_classify_document_duplicate_job(client, mock_user, mock_student):
    submission_id = uuid4()
    existing_job = SimpleNamespace(id=uuid4())
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            with patch(
                "app.routers.documents.classification.duplicate_check",
                new_callable=AsyncMock,
                return_value=existing_job,
            ):
                response = client.post(
                    f"/api/me/documents/{submission_id}/classify",
                )

    assert response.status_code == 409


def test_classify_document_closed_year(client, mock_user, mock_student):
    submission_id = uuid4()

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            side_effect=HTTPException(
                status_code=409,
                detail="Your school year is closed and archived. Document uploads and edits are no longer allowed.",
            ),
        ):
            response = client.post(
                f"/api/me/documents/{submission_id}/classify",
            )

    assert response.status_code == 409


# ── classify_all_documents ───────────────────────────────────────────────────


def test_classify_all_creates_job(client, mock_user, mock_student):
    job_id = uuid4()
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
    )
    job = SimpleNamespace(
        id=job_id,
        operation="classify",
        status=JobStatus.QUEUED,
        progress=0,
        total=1,
    )

    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[submission])))

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            with patch(
                "app.routers.documents.classification.duplicate_check",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch(
                    "app.routers.documents.classification.create_job",
                    new_callable=AsyncMock,
                    return_value=job,
                ):
                    response = client.post("/api/me/documents/classify-all")

    assert response.status_code == 202
    data = response.json()
    assert data["job_id"] == str(job_id)


def test_classify_all_custom_ids(client, mock_user, mock_student):
    job_id = uuid4()
    sid1, sid2 = uuid4(), uuid4()
    submission1 = SimpleNamespace(
        id=sid1,
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
    )
    submission2 = SimpleNamespace(
        id=sid2,
        student_id=mock_student.id,
        status=SubmissionStatus.FLAGGED,
    )
    job = SimpleNamespace(
        id=job_id,
        operation="classify",
        status=JobStatus.QUEUED,
        progress=0,
        total=2,
    )

    result = MagicMock()
    result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission1, submission2]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            with patch(
                "app.routers.documents.classification.duplicate_check",
                new_callable=AsyncMock,
                return_value=None,
            ):
                with patch(
                    "app.routers.documents.classification.create_job",
                    new_callable=AsyncMock,
                    return_value=job,
                ) as mock_create_job:
                    response = client.post(
                        "/api/me/documents/classify-all",
                        json={"submission_ids": [str(sid1), str(sid2)]},
                    )

    assert response.status_code == 202
    data = response.json()
    assert data["job_id"] == str(job_id)
    call_args = mock_create_job.call_args
    _, kwargs = call_args
    submission_ids_arg = kwargs["submission_ids"]
    assert set(submission_ids_arg) == {sid1, sid2}


def test_classify_all_no_eligible(client, mock_user, mock_student):
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification._require_student_onboarded",
        new_callable=AsyncMock,
        return_value=mock_student,
    ):
        with patch(
            "app.routers.documents.classification._ensure_school_year_not_closed",
            new_callable=AsyncMock,
        ):
            response = client.post("/api/me/documents/classify-all")

    assert response.status_code == 400


# ── confirm_classification ───────────────────────────────────────────────────


def test_confirm_classification_sets_type(client, mock_user, mock_student):
    submission_id = uuid4()
    doc_type_id = uuid4()
    doc_type = SimpleNamespace(id=doc_type_id, name="Admission Form")
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="file.pdf",
        file_key="staging/student/file.pdf",
        file_size="1024",
        mime_type="application/pdf",
        is_compiled=False,
        document_type_id=None,
        document_type=doc_type,
        classification_result={"type": "ADMISSION_FORM", "confidence": 0.95},
        created_at=None,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(side_effect=[submission, doc_type])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification.ensure_user_row",
        new_callable=AsyncMock,
        return_value=mock_user,
    ):
        with patch(
            "app.routers.documents.classification.attributes.flag_modified",
        ):
            response = client.post(
                f"/api/me/documents/{submission_id}/confirm",
                json={"document_type_id": str(doc_type_id)},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "classified"
    assert data["document_type_name"] == "Admission Form"


def test_confirm_classification_invalid_status(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.PENDING,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch(
        "app.routers.documents.classification.ensure_user_row",
        new_callable=AsyncMock,
        return_value=mock_user,
    ):
        response = client.post(
            f"/api/me/documents/{submission_id}/confirm",
            json={},
        )

    assert response.status_code == 409
