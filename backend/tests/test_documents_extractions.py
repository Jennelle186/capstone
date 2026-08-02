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
from app.models import SubmissionStatus


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
        program_id=uuid4(),
        classification=SimpleNamespace(value="freshman"),
        classification_set_by_user=True,
        student_number="20260001",
    )


def _student_execute_result(student):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=student)
    return result


# ── PATCH /api/me/documents/{id}/extraction ──────────────────────────────────


def test_patch_extraction_field_saves_value(client, mock_user, mock_student):
    submission_id = uuid4()
    doc_type_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=doc_type_id,
        status=SubmissionStatus.CLASSIFIED,
        extracted_data=None,
    )

    syr_result = MagicMock()
    syr_result.scalar_one_or_none = MagicMock(return_value=None)

    slot_item_result = MagicMock()
    slot_item_result.scalar_one_or_none = MagicMock(return_value=None)

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            syr_result,
            slot_item_result,
        ])
        session.get = AsyncMock(side_effect=lambda model, pk: None if model.__name__ == "SchoolYear" else submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.extractions._ensure_school_year_not_closed"):
            with patch("app.routers.documents.extractions.attributes.flag_modified"):
                response = client.patch(
                    f"/api/me/documents/{submission_id}/extraction",
                    json={"field_id": "f1", "value": "John Doe"},
                )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "f1"
    assert data["value"] == "John Doe"
    assert data["needs_review"] is False
    assert data["confidence"] == 1.0
    assert data["source_key"] == "manual"

    assert submission.extracted_data is not None
    assert submission.extracted_data["f1"]["value"] == "John Doe"
    assert submission.extracted_data["f1"]["needs_review"] is False
    assert submission.extracted_data["f1"]["confidence"] == 1.0
    assert submission.extracted_data["f1"]["source_key"] == "manual"


def test_patch_extraction_submission_not_found(client, mock_user, mock_student):
    submission_id = uuid4()

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch(
            f"/api/me/documents/{submission_id}/extraction",
            json={"field_id": "f1", "value": "test"},
        )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_patch_extraction_wrong_student(client, mock_user, mock_student):
    submission_id = uuid4()
    other_student_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=other_student_id,
        status=SubmissionStatus.CLASSIFIED,
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=submission)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.patch(
            f"/api/me/documents/{submission_id}/extraction",
            json={"field_id": "f1", "value": "test"},
        )

    assert response.status_code == 403


def test_patch_extraction_closed_school_year(client, mock_user, mock_student):
    submission_id = uuid4()

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch(
            "app.routers.documents.extractions._ensure_school_year_not_closed",
            side_effect=HTTPException(status_code=409, detail="Your school year is closed and archived."),
        ):
            response = client.patch(
                f"/api/me/documents/{submission_id}/extraction",
                json={"field_id": "f1", "value": "test"},
            )

    assert response.status_code == 409
    assert "closed" in response.json()["detail"].lower()


# ── GET /api/me/documents/extractions ────────────────────────────────────────


def test_list_extractions_filters_by_schema(client, mock_user, mock_student):
    dt_with_schema = SimpleNamespace(id=uuid4(), name="Transcript", code="TRANSCRIPT")
    dt_without_schema = SimpleNamespace(id=uuid4(), name="Unknown", code="UNKNOWN")
    schema_id = uuid4()

    sub_with_schema = SimpleNamespace(
        id=uuid4(),
        student_id=mock_student.id,
        document_type_id=dt_with_schema.id,
        document_type=dt_with_schema,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="with_schema.pdf",
        extracted_data={},
    )
    sub_without_schema = SimpleNamespace(
        id=uuid4(),
        student_id=mock_student.id,
        document_type_id=dt_without_schema.id,
        document_type=dt_without_schema,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="without_schema.pdf",
        extracted_data={},
    )

    schema_req = SimpleNamespace(
        document_type_id=dt_with_schema.id,
        extraction_schema_id=schema_id,
    )
    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[{"id": "f1", "key": "gpa", "type": "string"}],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[sub_with_schema, sub_without_schema]))
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
        response = client.get("/api/me/documents/extractions")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1, f"Expected 1 extraction item (only with active schema), got {len(data)}"
    assert data[0]["submission_id"] == str(sub_with_schema.id)


def test_list_extractions_hides_replaced_submissions(client, mock_user, mock_student):
    dt = SimpleNamespace(id=uuid4(), name="Form", code="FORM")
    schema_id = uuid4()
    replacement_id = uuid4()

    original_sub = SimpleNamespace(
        id=uuid4(),
        student_id=mock_student.id,
        document_type_id=dt.id,
        document_type=dt,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="original.pdf",
        extracted_data={},
    )
    replacement_sub = SimpleNamespace(
        id=replacement_id,
        student_id=mock_student.id,
        document_type_id=dt.id,
        document_type=dt,
        status=SubmissionStatus.CLASSIFIED,
        original_filename="replacement.pdf",
        extracted_data={},
        parent_submission_id=original_sub.id,
    )

    schema_req = SimpleNamespace(
        document_type_id=dt.id,
        extraction_schema_id=schema_id,
    )
    schema_obj = SimpleNamespace(
        id=schema_id,
        status="active",
        fields_json=[{"id": "f1", "key": "name", "type": "string"}],
    )

    submissions_result = MagicMock()
    submissions_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[replacement_sub]))
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
        response = client.get("/api/me/documents/extractions")

    assert response.status_code == 200
    data = response.json()
    response_ids = [item["submission_id"] for item in data]
    assert str(original_sub.id) not in response_ids, "Replaced submission should be hidden"
    assert str(replacement_sub.id) in response_ids


# ── POST /api/me/documents/extract-all ───────────────────────────────────────


def test_list_extractions_skips_already_extracted(client, mock_user, mock_student):
    dt_id = uuid4()
    schema_id = uuid4()
    submission_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=dt_id,
        status=SubmissionStatus.CLASSIFIED,
        extracted_data={"f1": {"value": "already", "confidence": 0.95}},
    )

    submission_result = MagicMock()
    submission_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    req = SimpleNamespace(
        document_type_id=dt_id,
        extraction_schema_id=schema_id,
    )

    req_result = MagicMock()
    req_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[req]))
    )

    slot_items_result = MagicMock()
    slot_items_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    schema_id = uuid4()

    schemas_result = MagicMock()
    schemas_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[schema_id]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submission_result,
            req_result,
            slot_items_result,
            schemas_result,
        ])
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch("app.routers.documents.extractions._ensure_school_year_not_closed"):
            response = client.post(
                "/api/me/documents/extract-all",
                json={"submission_ids": [str(submission_id)]},
            )

    assert response.status_code == 400
    assert "already have extracted data" in response.json()["detail"]


def test_extract_all_requires_eligible_status(client, mock_user, mock_student):
    submission_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=mock_student.id,
        document_type_id=uuid4(),
        status=SubmissionStatus.PENDING,
    )

    submission_result = MagicMock()
    submission_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submission_result,
        ])
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/extract-all",
            json={"submission_ids": [str(submission_id)]},
        )

    assert response.status_code == 409
    assert "pending" in response.json()["detail"].lower()


def test_extract_all_not_found(client, mock_user, mock_student):
    submission_id = uuid4()

    submission_result = MagicMock()
    submission_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submission_result,
        ])
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/extract-all",
            json={"submission_ids": [str(submission_id)]},
        )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_extract_all_wrong_student(client, mock_user, mock_student):
    submission_id = uuid4()
    other_student_id = uuid4()

    submission = SimpleNamespace(
        id=submission_id,
        student_id=other_student_id,
        document_type_id=uuid4(),
        status=SubmissionStatus.CLASSIFIED,
    )

    submission_result = MagicMock()
    submission_result.scalars = MagicMock(
        return_value=MagicMock(all=MagicMock(return_value=[submission]))
    )

    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(side_effect=[
            _student_execute_result(mock_student),
            submission_result,
        ])
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/extract-all",
            json={"submission_ids": [str(submission_id)]},
        )

    assert response.status_code == 403


def test_extract_all_no_eligible_docs(client, mock_user, mock_student):
    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        response = client.post(
            "/api/me/documents/extract-all",
            json={"submission_ids": []},
        )

    assert response.status_code == 400
    assert "No documents eligible" in response.json()["detail"]


def test_extract_all_closed_school_year(client, mock_user, mock_student):
    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_student_execute_result(mock_student))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    with patch("app.routers.documents.uploads.ensure_user_row", new_callable=AsyncMock, return_value=mock_user):
        with patch(
            "app.routers.documents.extractions._ensure_school_year_not_closed",
            side_effect=HTTPException(status_code=409, detail="Your school year is closed and archived."),
        ):
            response = client.post("/api/me/documents/extract-all", json={})

    assert response.status_code == 409
    assert "closed" in response.json()["detail"].lower()
