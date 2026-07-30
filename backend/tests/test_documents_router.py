from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.models import SubmissionStatus


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
        student_number="20260001",
    )


def _student_execute_result(student):
    """Return a mocked execute result whose scalar_one_or_none returns the student."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


def test_initiate_upload_returns_presigned_post(client, mock_user, mock_student):
    async def override_get_db_session_initiate():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_initiate

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_generate_presigned_post", return_value={
            "url": "https://storage.googleapis.com/bucket/staging",
            "fields": {"key": "staging/student/file.pdf", "policy": "abc"},
            "key": "staging/student/file.pdf",
        }):
            response = client.post(
                "/api/me/documents/initiate",
                json={"name": "file.pdf", "type": "application/pdf", "size": 1024},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://storage.googleapis.com/bucket/staging"
    assert data["fields"]["key"] == "staging/student/file.pdf"
    assert "submission_id" in data


def test_confirm_upload_verifies_s3_and_marks_uploaded(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        file_key="staging/student/file.pdf",
        original_filename="file.pdf",
        mime_type="application/pdf",
        file_size="1024",
        is_compiled=False,
        status=SubmissionStatus.PENDING,
    )

    async def override_get_db_session_confirm():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_confirm

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_head_object", return_value={"ContentLength": 1024}):
            response = client.post(
                "/api/me/documents/confirm",
                json={"submission_id": str(submission_id)},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "uploaded"
    assert data["file_key"] == "staging/student/file.pdf"


def test_list_my_documents_returns_submissions(client, mock_user, mock_student):
    doc_type = SimpleNamespace(name="Admission Form", code="ADMISSION_FORM")
    submission = SimpleNamespace(
        id=uuid4(),
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/file.pdf",
        original_filename="file.pdf",
        file_size="1024",
        mime_type="application/pdf",
        is_compiled=False,
        document_type_id=None,
        document_type=doc_type,
        classification_result={"type": "ADMISSION_FORM", "confidence": 0.95},
        parent_submission_id=None,
        extracted_data=None,
        llama_job_id="llama-file-id",
        rejection_reason=None,
        created_at=None,
    )

    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[submission])))

    async def override_get_db_session_list():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=result)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_list

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/documents")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["status"] == "classified"
    assert data[0]["document_type_name"] == "Admission Form"


def test_get_download_url_returns_presigned_url(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
        file_key="staging/student/file.pdf",
    )

    async def override_get_db_session_download():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_download

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_generate_presigned_url", return_value="https://storage.googleapis.com/bucket/view"):
            response = client.get(f"/api/me/documents/{submission_id}/download-url")

    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://storage.googleapis.com/bucket/view"
    assert data["expires_in"] == 3600


def test_delete_document_removes_submission_and_s3_object(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.FLAGGED,
        file_key="staging/student/file.pdf",
    )

    async def override_get_db_session_delete():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_delete

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_delete_file") as mock_s3_delete:
            response = client.delete(f"/api/me/documents/{submission_id}")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    mock_s3_delete.assert_called_once_with("staging/student/file.pdf")


def test_get_download_url_allows_verified(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.VERIFIED,
        file_key="staging/student/file.pdf",
    )

    async def override_get_db_session_download():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_download

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_generate_presigned_url", return_value="https://storage.googleapis.com/bucket/view"):
            response = client.get(f"/api/me/documents/{submission_id}/download-url")

    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://storage.googleapis.com/bucket/view"


def test_list_extractions_includes_verified_submission(client, mock_user, mock_student):
    submission_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Admission Form", code="ADMISSION_FORM")
    schema_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.VERIFIED,
        original_filename="file.pdf",
        extracted_data={},
    )

    schema_req = SimpleNamespace(
        document_type_id=doc_type.id,
        extraction_schema_id=schema_id,
    )
    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[
            {"id": "f1", "key": "name", "type": "string", "description": "Full Name"},
        ],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    verified_ids_result = MagicMock()
    verified_ids_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[doc_type.id]))
    )

    requirements_result = MagicMock()
    requirements_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_req]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
        ])
        session.get = AsyncMock(return_value=schema_obj)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.extractions.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get(
            "/api/me/documents/extractions?status=classified,flagged,processing,submitted,in-review,verified"
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["submission_id"] == str(submission_id)
    assert data[0]["status"] == "verified"


def test_list_extractions_excludes_nonverified_of_verified_type(client, mock_user, mock_student):
    verified_id = uuid4()
    pending_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Transcript", code="REPORT_CARD")
    schema_id = uuid4()

    verified_sub = SimpleNamespace(
        id=verified_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.VERIFIED,
        original_filename="verified.pdf",
        extracted_data={},
    )
    pending_sub = SimpleNamespace(
        id=pending_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="pending.pdf",
        extracted_data={},
    )

    schema_req = SimpleNamespace(
        document_type_id=doc_type.id,
        extraction_schema_id=schema_id,
    )
    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[{"id": "f1", "key": "gpa", "type": "string"}],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(
            all=MagicMock(return_value=[verified_sub, pending_sub])
        )
    )

    verified_ids_result = MagicMock()
    verified_ids_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[doc_type.id]))
    )

    requirements_result = MagicMock()
    requirements_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_req]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
        ])
        session.get = AsyncMock(return_value=schema_obj)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.extractions.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get(
            "/api/me/documents/extractions?status=classified,flagged,processing,submitted,in-review,verified"
        )

    assert response.status_code == 200
    data = response.json()
    response_ids = [item["submission_id"] for item in data]
    assert str(verified_id) in response_ids
    assert str(pending_id) not in response_ids


def test_retry_upload_rejects_non_pending_status(client, mock_user, mock_student):
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.UPLOADED,
        file_key="staging/student/file.pdf",
        mime_type="application/pdf",
    )

    async def override_get_db_session_retry():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_retry

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(f"/api/me/documents/{submission_id}/retry", json={})

    assert response.status_code == 409
    assert "Only PENDING submissions can be retried" in response.json()["detail"]
