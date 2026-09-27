from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call, patch
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
        classification_set_by_user=True,
        student_number="20260001",
        program_mismatch_pending=False,
        program_mismatch_extracted=None,
    )


def _student_execute_result(student):
    """Return a mocked execute result whose scalar_one_or_none returns the student."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


def _scalar_result(value):
    """Return a mocked execute result whose scalar_one_or_none returns value."""
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=value)
    return result


def _scalars_all_result(values):
    """Return a mocked execute result whose scalars().all() returns values."""
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=values)))
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
        page_range=None,
        segment_index=None,
        is_compiled_parent=False,
        page_count=None,
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


def test_list_my_documents_groups_compiled_children(client, mock_user, mock_student):
    parent = SimpleNamespace(
        id=uuid4(),
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/compiled.pdf",
        original_filename="compiled.pdf",
        file_size="1024",
        mime_type="application/pdf",
        is_compiled=True,
        document_type_id=None,
        document_type=None,
        classification_result={"compiled_parent": True},
        parent_submission_id=None,
        extracted_data=None,
        rejection_reason=None,
        page_range=None,
        segment_index=None,
        is_compiled_parent=True,
        page_count=4,
        created_at=None,
    )
    doc_type = SimpleNamespace(name="Admission Form", code="ADMISSION_FORM")
    child = SimpleNamespace(
        id=uuid4(),
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/compiled.pdf.seg0.pdf",
        original_filename="compiled.pdf (pages 1-2)",
        file_size="1024",
        mime_type="application/pdf",
        is_compiled=False,
        document_type_id=uuid4(),
        document_type=doc_type,
        classification_result={"type": "ADMISSION_FORM"},
        parent_submission_id=parent.id,
        extracted_data=None,
        rejection_reason=None,
        page_range="1-2",
        segment_index=0,
        is_compiled_parent=False,
        page_count=2,
        created_at=None,
    )

    student_result = _student_execute_result(mock_student)
    subs_result = _scalars_all_result([parent, child])

    async def override_get_db_session_list():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[student_result, subs_result])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_list

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/documents")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1  # child is nested, not a top-level item
    assert data[0]["is_compiled_parent"] is True
    assert data[0]["page_count"] == 4
    assert len(data[0]["children"]) == 1
    assert data[0]["children"][0]["page_range"] == "1-2"
    assert data[0]["children"][0]["segment_index"] == 0


def test_list_my_documents_omits_childless_compiled_parent(client, mock_user, mock_student):
    parent = SimpleNamespace(
        id=uuid4(),
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/compiled.pdf",
        original_filename="compiled.pdf",
        file_size="1024",
        mime_type="application/pdf",
        is_compiled=True,
        document_type_id=None,
        document_type=None,
        classification_result={"compiled_parent": True},
        parent_submission_id=None,
        extracted_data=None,
        rejection_reason=None,
        page_range=None,
        segment_index=None,
        is_compiled_parent=True,
        page_count=4,
        created_at=None,
    )

    student_result = _student_execute_result(mock_student)
    subs_result = _scalars_all_result([parent])

    async def override_get_db_session_list():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[student_result, subs_result])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_list

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/documents")

    assert response.status_code == 200
    data = response.json()
    assert data == []


def test_submit_batch_compiled_child_skips_replacement_history(client, mock_user, mock_student):
    """A compiled-PDF child (parent is_compiled_parent=True) submits cleanly and
    must NOT get REUPLOADED/REPLACEMENT_OF lineage history (that path is for
    Bug 5F replace-duplicate, not Feature 3 split children)."""
    parent_id = uuid4()
    child_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Report Card", code="REPORT_CARD")

    parent = SimpleNamespace(
        id=parent_id,
        is_compiled_parent=True,
        rejection_reason=None,
        flagged_by=None,
    )
    child = SimpleNamespace(
        id=child_id,
        status=SubmissionStatus.CLASSIFIED,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        parent_submission_id=parent_id,
        file_key="staging/x.pdf",
        is_compiled_parent=False,
    )

    student_result = MagicMock()
    student_result.scalar_one_or_none = MagicMock(return_value=mock_student)
    subs_result = MagicMock()
    subs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[child])))
    verified_result = MagicMock()
    verified_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    captured = {}

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.delete = AsyncMock()
        session.commit = AsyncMock()
        session.execute = AsyncMock(side_effect=[student_result, subs_result, verified_result])
        session.get = AsyncMock(side_effect=lambda model, pk: None if model.__name__ == "SchoolYear" else parent)
        captured["session"] = session
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.get_student_slot_statuses", new_callable=AsyncMock, return_value=[]):
            response = client.post(
                "/api/me/documents/submit-batch",
                json={"submission_ids": [str(child_id)]},
            )

    assert response.status_code == 200
    assert child.status == SubmissionStatus.SUBMITTED

    history_actions = [
        call.args[0].action
        for call in captured["session"].add.call_args_list
        if call.args and getattr(call.args[0], "action", None)
    ]
    assert "SUBMITTED" in history_actions
    assert "REPLACEMENT_OF" not in history_actions
    assert "REUPLOADED" not in history_actions


def test_submit_batch_replacement_uses_student_as_actor(client, mock_user, mock_student):
    """Bug 5F replace flow with an unflagged old doc must not crash; the actor
    falls back to the student, not the (undefined) `user`."""
    old_id = uuid4()
    child_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Report Card", code="REPORT_CARD")

    old_sub = SimpleNamespace(
        id=old_id,
        is_compiled_parent=False,
        rejection_reason=None,
        flagged_by=None,
    )
    child = SimpleNamespace(
        id=child_id,
        status=SubmissionStatus.CLASSIFIED,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        parent_submission_id=old_id,
        file_key="staging/x.pdf",
        is_compiled_parent=False,
    )

    student_result = MagicMock()
    student_result.scalar_one_or_none = MagicMock(return_value=mock_student)
    subs_result = MagicMock()
    subs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[child])))
    verified_result = MagicMock()
    verified_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    captured = {}

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.delete = AsyncMock()
        session.commit = AsyncMock()
        session.execute = AsyncMock(side_effect=[student_result, subs_result, verified_result])
        session.get = AsyncMock(side_effect=lambda model, pk: None if model.__name__ == "SchoolYear" else old_sub)
        captured["session"] = session
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.get_student_slot_statuses", new_callable=AsyncMock, return_value=[]):
            response = client.post(
                "/api/me/documents/submit-batch",
                json={"submission_ids": [str(child_id)]},
            )

    assert response.status_code == 200
    assert child.status == SubmissionStatus.SUBMITTED

    replacement = next(
        (call.args[0] for call in captured["session"].add.call_args_list
         if call.args and getattr(call.args[0], "action", None) == "REPLACEMENT_OF"),
        None,
    )
    assert replacement is not None
    assert replacement.actor_user_id == mock_student.user_id


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
        parent_submission_id=None,
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


def test_delete_document_cascades_empty_compiled_parent(client, mock_user, mock_student):
    parent_id = uuid4()
    child_id = uuid4()
    parent = SimpleNamespace(
        id=parent_id,
        student_id=mock_student.id,
        is_compiled_parent=True,
        file_key="staging/student/compiled.pdf",
    )
    child = SimpleNamespace(
        id=child_id,
        student_id=mock_student.id,
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/compiled.pdf.seg0.pdf",
        parent_submission_id=parent_id,
    )

    student_result = _student_execute_result(mock_student)
    remaining_result = MagicMock()
    remaining_result.first = MagicMock(return_value=None)

    captured = {}

    async def override_get_db_session_delete():
        session = AsyncMock()
        session.add = MagicMock()
        session.delete = AsyncMock()
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.execute = AsyncMock(side_effect=[student_result, remaining_result])
        session.get = AsyncMock(side_effect=[None, child, parent])
        captured["session"] = session
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_delete

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_delete_file") as mock_s3_delete:
            response = client.delete(f"/api/me/documents/{child_id}")

    assert response.status_code == 200
    assert response.json()["ok"] is True

    deleted = [call.args[0] for call in captured["session"].delete.await_args_list]
    assert child in deleted
    assert parent in deleted

    mock_s3_delete.assert_has_calls(
        [call("staging/student/compiled.pdf.seg0.pdf"), call("staging/student/compiled.pdf")],
        any_order=False,
    )


def test_delete_document_keeps_compiled_parent_with_remaining_children(client, mock_user, mock_student):
    parent_id = uuid4()
    child_id = uuid4()
    parent = SimpleNamespace(
        id=parent_id,
        student_id=mock_student.id,
        is_compiled_parent=True,
        file_key="staging/student/compiled.pdf",
    )
    child = SimpleNamespace(
        id=child_id,
        student_id=mock_student.id,
        status=SubmissionStatus.CLASSIFIED,
        file_key="staging/student/compiled.pdf.seg0.pdf",
        parent_submission_id=parent_id,
    )

    student_result = _student_execute_result(mock_student)
    remaining_result = MagicMock()
    remaining_result.first = MagicMock(return_value=(uuid4(),))

    captured = {}

    async def override_get_db_session_delete():
        session = AsyncMock()
        session.add = MagicMock()
        session.delete = AsyncMock()
        session.commit = AsyncMock()
        session.flush = AsyncMock()
        session.execute = AsyncMock(side_effect=[student_result, remaining_result])
        session.get = AsyncMock(side_effect=[None, child, parent])
        captured["session"] = session
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_delete

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_delete_file") as mock_s3_delete:
            response = client.delete(f"/api/me/documents/{child_id}")

    assert response.status_code == 200
    assert response.json()["ok"] is True

    deleted = [call.args[0] for call in captured["session"].delete.await_args_list]
    assert child in deleted
    assert parent not in deleted

    mock_s3_delete.assert_called_once_with("staging/student/compiled.pdf.seg0.pdf")


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

    slot_items_result = MagicMock()
    slot_items_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    schemas_batch_result = MagicMock()
    schemas_batch_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_obj]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
            slot_items_result,
            schemas_batch_result,
        ])
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
        created_at=datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc),
    )
    pending_sub = SimpleNamespace(
        id=pending_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="pending.pdf",
        extracted_data={},
        created_at=datetime(2026, 8, 16, 11, 0, tzinfo=timezone.utc),
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

    slot_items_result = MagicMock()
    slot_items_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    schemas_batch_result = MagicMock()
    schemas_batch_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_obj]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
            slot_items_result,
            schemas_batch_result,
        ])
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


def test_list_extractions_finds_schemas_in_slot_items(client, mock_user, mock_student):
    """Bug 5G: Extraction discovers schemas from requirement_slot_items (new system)."""
    submission_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Slot Doc", code="SLOT_DOC")
    schema_id = uuid4()
    slot_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="slot_doc.pdf",
        extracted_data={},
    )

    slot_item = SimpleNamespace(
        id=uuid4(),
        requirement_slot_id=slot_id,
        document_type_id=doc_type.id,
        extraction_schema_id=schema_id,
        is_primary=True,
    )

    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[{"id": "f1", "key": "name", "type": "string"}],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    verified_ids_result = MagicMock()
    verified_ids_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    requirements_result = MagicMock()
    requirements_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    slot_items_result = MagicMock()
    slot_items_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[slot_item]))
    )

    schemas_batch_result = MagicMock()
    schemas_batch_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_obj]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
            slot_items_result,
            schemas_batch_result,
        ])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.extractions.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/documents/extractions")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1, f"Expected 1 extraction item (slot-only), got {len(data)}"
    assert data[0]["submission_id"] == str(submission_id)


def test_list_extractions_merges_legacy_and_slot_schemas(client, mock_user, mock_student):
    """Bug 5G: Legacy + slot schemas merge without duplicating documents."""
    submission_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Dual Doc", code="DUAL_DOC")
    schema_id = uuid4()
    slot_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="dual.pdf",
        extracted_data={},
    )

    schema_req = SimpleNamespace(
        document_type_id=doc_type.id,
        extraction_schema_id=schema_id,
    )

    slot_item = SimpleNamespace(
        id=uuid4(),
        requirement_slot_id=slot_id,
        document_type_id=doc_type.id,
        extraction_schema_id=schema_id,
        is_primary=True,
    )

    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[{"id": "f1", "key": "name", "type": "string"}],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    verified_ids_result = MagicMock()
    verified_ids_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    requirements_result = MagicMock()
    requirements_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_req]))
    )

    slot_items_result = MagicMock()
    slot_items_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[slot_item]))
    )

    schemas_batch_result = MagicMock()
    schemas_batch_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_obj]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submissions_result,
            verified_ids_result,
            requirements_result,
            slot_items_result,
            schemas_batch_result,
        ])
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.extractions.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.get("/api/me/documents/extractions")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1, f"Expected 1 item (merged not duplicated), got {len(data)}"
    assert data[0]["submission_id"] == str(submission_id)


def test_initiate_upload_rejects_verified_duplicate(client, mock_user, mock_student):
    """Bug 5F follow-up: a VERIFIED submission blocks a fresh upload of the same type."""
    doc_type_id = uuid4()
    verified_id = uuid4()
    school_year = SimpleNamespace(status="active")
    doc_type = SimpleNamespace(name="Admission Form")

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=[
        _student_execute_result(mock_student),
        _scalars_all_result([]),
        MagicMock(),
        _scalar_result(None),
        _scalar_result(verified_id),
    ])
    session.get = AsyncMock(side_effect=[school_year, doc_type])

    async def override_get_db_session():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/initiate",
            json={
                "name": "admission.pdf",
                "type": "application/pdf",
                "size": 1024,
                "document_type_id": str(doc_type_id),
            },
        )

    assert response.status_code == 409
    data = response.json()
    assert data["error_code"] == "duplicate_verified_document"
    assert data["document_type_id"] == str(doc_type_id)
    assert "already been verified" in data["detail"]
    session.add.assert_not_called()


def test_initiate_upload_concurrency_verified(client, mock_user, mock_student):
    """Bug 5F follow-up: two uploads against an already-VERIFIED type both get 409."""
    doc_type_id = uuid4()
    verified_id = uuid4()
    school_year = SimpleNamespace(status="active")
    doc_type = SimpleNamespace(name="Admission Form")
    created_submissions: list = []

    def build_session():
        session = AsyncMock()
        session.add = MagicMock(side_effect=lambda obj: created_submissions.append(obj))
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            _scalars_all_result([]),
            MagicMock(),
            _scalar_result(None),
            _scalar_result(verified_id),
        ])
        session.get = AsyncMock(side_effect=[school_year, doc_type])
        return session

    async def override_get_db_session():
        yield build_session()

    app.dependency_overrides[get_db_session] = override_get_db_session

    payload = {
        "name": "admission.pdf",
        "type": "application/pdf",
        "size": 1024,
        "document_type_id": str(doc_type_id),
    }
    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        res1 = client.post("/api/me/documents/initiate", json=payload)
        res2 = client.post("/api/me/documents/initiate", json=payload)

    assert res1.status_code == 409
    assert res2.status_code == 409
    assert res1.json()["error_code"] == "duplicate_verified_document"
    assert res2.json()["error_code"] == "duplicate_verified_document"
    assert created_submissions == []


def test_initiate_upload_rejects_submitted_duplicate(client, mock_user, mock_student):
    """Regression: the existing SUBMITTED/IN_REVIEW guard still blocks."""
    doc_type_id = uuid4()
    existing_id = uuid4()
    school_year = SimpleNamespace(status="active")

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=[
        _student_execute_result(mock_student),
        _scalars_all_result([]),
        MagicMock(),
        _scalar_result(existing_id),
    ])
    session.get = AsyncMock(return_value=school_year)

    async def override_get_db_session():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/initiate",
            json={
                "name": "a.pdf",
                "type": "application/pdf",
                "size": 1,
                "document_type_id": str(doc_type_id),
            },
        )

    assert response.status_code == 409
    assert "cannot submit the same document" in response.json()["detail"]
    session.add.assert_not_called()


def test_initiate_upload_replace_rejects_verified(client, mock_user, mock_student):
    """Regression: the replace_submission_id VERIFIED guard still blocks."""
    replace_id = uuid4()
    doc_type_id = uuid4()
    verified_id = uuid4()
    school_year = SimpleNamespace(status="active")
    doc_type = SimpleNamespace(name="Admission Form")
    old_sub = SimpleNamespace(
        id=replace_id,
        student_id=mock_student.id,
        document_type_id=doc_type_id,
        document_type=doc_type,
    )

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=[
        _student_execute_result(mock_student),
        _scalars_all_result([]),
        _scalar_result(old_sub),
        _scalar_result(verified_id),
    ])
    session.get = AsyncMock(return_value=school_year)

    async def override_get_db_session():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_generate_presigned_post", return_value={
            "url": "https://storage.googleapis.com/bucket/staging",
            "fields": {"key": "k", "policy": "p"},
            "key": "k",
        }):
            response = client.post(
                "/api/me/documents/initiate",
                json={
                    "name": "a.pdf",
                    "type": "application/pdf",
                    "size": 1,
                    "replace_submission_id": str(replace_id),
                },
            )

    assert response.status_code == 409
    assert "already verified and cannot be re-uploaded" in response.json()["detail"]
    session.add.assert_not_called()


def test_resolve_duplicate_rejects_verified(client, mock_user, mock_student):
    """Regression: resolve_duplicate still refuses to remove a VERIFIED submission."""
    submission_id = uuid4()
    school_year = SimpleNamespace(status="active")
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.VERIFIED,
        file_key="staging/student/file.pdf",
    )

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(side_effect=[
        _student_execute_result(mock_student),
        _scalar_result(submission),
    ])
    session.get = AsyncMock(return_value=school_year)

    async def override_get_db_session():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(f"/api/me/documents/{submission_id}/resolve-duplicate")

    assert response.status_code == 409
    assert "submitted or verified" in response.json()["detail"]


# ── Tests for PATCH /api/me/classification ──────────────────────────────────


def test_patch_classification_succeeds_when_not_set(client, mock_user, mock_student):
    """A student with default FRESHMAN classification and classification_set_by_user=False
    should be able to set their classification."""
    mock_student.classification = "freshman"
    mock_student.classification_set_by_user = False

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch("/api/me/classification", json={"classification": "transferee"})

    assert response.status_code == 200
    assert response.json()["classification"] == "transferee"
    session.commit.assert_awaited_once()


def test_patch_classification_409_when_already_set(client, mock_user, mock_student):
    """A student who already set their classification should get 409."""
    mock_student.classification = SimpleNamespace(value="transferee")
    mock_student.classification_set_by_user = True

    session = AsyncMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch("/api/me/classification", json={"classification": "shifter"})

    assert response.status_code == 409
    assert "already been set" in response.json()["detail"]
    session.add.assert_not_called()


def test_patch_classification_409_when_non_freshman(client, mock_user, mock_student):
    """A student with a non-freshman classification but classification_set_by_user=False
    should get 409 (non-freshman counts as 'already set')."""
    mock_student.classification = "shifter"
    mock_student.classification_set_by_user = False

    session = AsyncMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch("/api/me/classification", json={"classification": "transferee"})

    assert response.status_code == 409
    assert "already been set" in response.json()["detail"]
    session.add.assert_not_called()


def test_patch_classification_400_for_invalid_value(client, mock_user, mock_student):
    """An invalid classification value should return 400."""
    mock_student.classification = "freshman"
    mock_student.classification_set_by_user = False

    session = AsyncMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch("/api/me/classification", json={"classification": "invalid_value"})

    assert response.status_code == 400
    assert "Invalid classification" in response.json()["detail"]
    session.add.assert_not_called()


def test_patch_classification_404_when_no_student(client, mock_user):
    """A request from a user with no student profile should return 404."""
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch("/api/me/classification", json={"classification": "transferee"})

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]
    session.add.assert_not_called()


# ── Tests for _require_student_onboarded guards ─────────────────────────────


def test_initiate_upload_blocks_without_classification(client, mock_user, mock_student):
    """Upload should be blocked when classification is not set."""
    mock_student.classification = None
    mock_student.classification_set_by_user = False

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/initiate",
            json={"name": "file.pdf", "type": "application/pdf", "size": 1024},
        )

    assert response.status_code == 400
    assert "classification" in response.json()["detail"].lower()
    session.add.assert_not_called()


def test_initiate_upload_blocks_without_program(client, mock_user, mock_student):
    """Upload should be blocked when program is not set."""
    mock_student.program_id = None

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/initiate",
            json={"name": "file.pdf", "type": "application/pdf", "size": 1024},
        )

    assert response.status_code == 400
    assert "program" in response.json()["detail"].lower()
    session.add.assert_not_called()


# ── Tests for POST /api/me/program/resolve-mismatch ─────────────────────────


def test_resolve_mismatch_keep_current(client, mock_user, mock_student):
    """A student can clear a program mismatch by keeping their current program."""
    mock_student.program_mismatch_pending = True
    mock_student.program_mismatch_extracted = "BSIT"

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post("/api/me/program/resolve-mismatch", json={"action": "keep_current"})

    assert response.status_code == 200
    body = response.json()
    assert body["mismatch_resolved"] is True
    assert body["action"] == "keep_current"
    assert mock_student.program_mismatch_pending is False
    assert mock_student.program_mismatch_extracted is None
    session.commit.assert_awaited_once()


def test_resolve_mismatch_confirm_extracted_with_id(client, mock_user, mock_student):
    """A student can confirm the extracted program by providing a program id."""
    mock_student.program_mismatch_pending = True
    mock_student.program_mismatch_extracted = "BSIT-AD"

    new_dept = SimpleNamespace(id=uuid4(), is_active=True)

    session = AsyncMock()
    session.add = MagicMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
    session.get = AsyncMock(return_value=new_dept)

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/program/resolve-mismatch",
            json={"action": "confirm_extracted", "program_id": str(new_dept.id)},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["action"] == "confirm_extracted"
    assert body["program_id"] == str(new_dept.id)
    assert mock_student.program_id == new_dept.id
    assert mock_student.program_mismatch_pending is False
    session.commit.assert_awaited_once()


def test_resolve_mismatch_409_when_no_pending(client, mock_user, mock_student):
    """Requesting resolution when no mismatch is pending should return 409."""
    mock_student.program_mismatch_pending = False

    session = AsyncMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post("/api/me/program/resolve-mismatch", json={"action": "keep_current"})

    assert response.status_code == 409
    assert "No program mismatch" in response.json()["detail"]
    session.add.assert_not_called()


def test_resolve_mismatch_400_invalid_action(client, mock_user, mock_student):
    """An unknown action should return 400."""
    mock_student.program_mismatch_pending = True

    session = AsyncMock()
    session.execute = AsyncMock(return_value=_student_execute_result(mock_student))

    async def override_get_db():
        yield session

    app.dependency_overrides[get_db_session] = override_get_db

    with patch("app.routers.documents.requirements.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post("/api/me/program/resolve-mismatch", json={"action": "bogus"})

    assert response.status_code == 400
    assert "Invalid action" in response.json()["detail"]
    session.add.assert_not_called()


# ── High-severity fix regression tests ──────────────────────────────────────


def test_delete_document_commits_before_gcs_delete(client, mock_user, mock_student):
    """Fix: GCS files are deleted only after the DB transaction commits. A commit
    that fails must not leave DB rows pointing at already-deleted objects."""
    submission_id = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        status=SubmissionStatus.FLAGGED,
        file_key="staging/student/file.pdf",
        parent_submission_id=None,
    )

    order = []

    async def override_get_db_session_delete():
        session = AsyncMock()
        session.add = MagicMock()

        async def commit():
            order.append("commit")

        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        session.commit = AsyncMock(side_effect=commit)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_delete

    def fake_gcs_delete(key):
        order.append("gcs_delete")

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.gcs_delete_file", side_effect=fake_gcs_delete):
            response = client.delete(f"/api/me/documents/{submission_id}")

    assert response.status_code == 200
    assert "commit" in order and "gcs_delete" in order
    assert order.index("commit") < order.index("gcs_delete")


def test_submit_batch_compiled_child_duplicate_not_relinked(client, mock_user, mock_student):
    """Fix: a compiled child sharing a document_type_id with an older FLAGGED
    submission must keep its compiled-parent lineage instead of being relinked to
    the flagged duplicate. The flagged duplicate is dropped instead."""
    compiled_parent_id = uuid4()
    child_id = uuid4()
    flagged_id = uuid4()
    doc_type = SimpleNamespace(id=uuid4(), name="Report Card", code="REPORT_CARD")

    compiled_parent = SimpleNamespace(
        id=compiled_parent_id,
        is_compiled_parent=True,
        rejection_reason=None,
        flagged_by=None,
    )
    flagged = SimpleNamespace(
        id=flagged_id,
        status=SubmissionStatus.FLAGGED,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        parent_submission_id=None,
        file_key="staging/flagged.pdf",
        is_compiled_parent=False,
        rejection_reason="blurry",
        flagged_by=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    child = SimpleNamespace(
        id=child_id,
        status=SubmissionStatus.CLASSIFIED,
        student_id=mock_student.id,
        document_type_id=doc_type.id,
        document_type=doc_type,
        parent_submission_id=compiled_parent_id,
        file_key="staging/compiled.seg0.pdf",
        is_compiled_parent=False,
        created_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )

    student_result = MagicMock()
    student_result.scalar_one_or_none = MagicMock(return_value=mock_student)
    subs_result = MagicMock()
    subs_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[flagged, child])))
    verified_result = MagicMock()
    verified_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    captured = {}

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.delete = AsyncMock()
        session.commit = AsyncMock()
        session.execute = AsyncMock(side_effect=[student_result, subs_result, verified_result])
        session.get = AsyncMock(side_effect=[None, compiled_parent])
        captured["session"] = session
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.uploads.get_student_slot_statuses", new_callable=AsyncMock, return_value=[]):
            with patch("app.routers.documents.uploads.gcs_delete_file"):
                response = client.post(
                    "/api/me/documents/submit-batch",
                    json={"submission_ids": [str(child_id), str(flagged_id)]},
                )

    assert response.status_code == 200
    # The compiled child keeps its compiled-parent lineage.
    assert child.parent_submission_id == compiled_parent_id

    # The flagged duplicate is dropped.
    deleted = [call.args[0] for call in captured["session"].delete.await_args_list]
    assert flagged in deleted
    assert child not in deleted

    # No REPLACEMENT_OF lineage history is written for the compiled child.
    history_actions = [
        call.args[0].action
        for call in captured["session"].add.call_args_list
        if call.args and getattr(call.args[0], "action", None)
    ]
    assert "REPLACEMENT_OF" not in history_actions
