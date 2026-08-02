from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.models import DocumentType, DocumentTypeStatus, SubmissionStatus


TEST_USER_CLAIMS = {
    "sub": "clerk_admin_123",
    "sid": "session_admin_123",
    "email": "admin@example.com",
    "role": "admin",
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
        role="admin",
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


def _doc_type_result(doc_type):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=doc_type)
    return result


def _empty_scalar_result():
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    return result


def _doc_type_list_result(doc_types):
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=doc_types)))
    return result


def _make_doc_type(**overrides):
    defaults = {
        "id": uuid4(),
        "name": "Admission Form",
        "code": "ADMISSION_FORM",
        "description": "Admission form document",
        "classifier_description": "An official admission form",
        "keywords": ["admission", "form"],
        "applicable_classifications": ["freshman"],
        "status": DocumentTypeStatus.ACTIVE,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_list_document_types_returns_all(client):
    doc_type = _make_doc_type()

    async def override_get_db_session_list():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_doc_type_list_result([doc_type]))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_list

    response = client.get("/api/admin/document-types")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Admission Form"
    assert data[0]["code"] == "ADMISSION_FORM"
    assert data[0]["status"] == "active"


def test_create_document_type_valid(client):
    doc_type = _make_doc_type()

    async def override_get_db_session_create():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_empty_scalar_result())
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        async def refresh_side_effect(obj):
            obj.id = doc_type.id
            obj.name = doc_type.name
            obj.code = doc_type.code
            obj.description = doc_type.description
            obj.classifier_description = doc_type.classifier_description
            obj.keywords = list(doc_type.keywords)
            obj.applicable_classifications = list(doc_type.applicable_classifications)
            obj.status = doc_type.status
            obj.created_at = doc_type.created_at
            obj.updated_at = doc_type.updated_at

        session.refresh.side_effect = refresh_side_effect

        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_create

    response = client.post(
        "/api/admin/document-types",
        json={
            "name": "Admission Form",
            "code": "ADMISSION_FORM",
            "description": "Admission form document",
            "classifier_description": "An official admission form",
            "keywords": ["admission", "form"],
            "applicable_classifications": ["freshman"],
            "status": "active",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Admission Form"
    assert data["code"] == "ADMISSION_FORM"
    assert data["status"] == "active"


def test_create_document_type_duplicate_code(client):
    existing = _make_doc_type(code="DUPLICATE_CODE")

    async def override_get_db_session_duplicate():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_doc_type_result(existing))
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_duplicate

    response = client.post(
        "/api/admin/document-types",
        json={
            "name": "Another Form",
            "code": "duplicate_code",
            "description": "Some description",
            "status": "active",
        },
    )

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_update_document_type(client):
    doc_type_id = uuid4()
    doc_type = _make_doc_type(id=doc_type_id, status=DocumentTypeStatus.ACTIVE)

    async def override_get_db_session_update():
        session = AsyncMock()
        session.add = MagicMock()
        session.get = AsyncMock(return_value=doc_type)
        session.execute = AsyncMock(return_value=_empty_scalar_result())
        session.commit = AsyncMock()
        session.refresh = AsyncMock()

        async def refresh_side_effect(obj):
            obj.name = "Updated Admission Form"
            obj.status = DocumentTypeStatus.ARCHIVED

        session.refresh.side_effect = refresh_side_effect

        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session_update

    response = client.patch(
        f"/api/admin/document-types/{doc_type_id}",
        json={
            "name": "Updated Admission Form",
            "status": "archived",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Admission Form"
    assert data["status"] == "archived"


def test_create_document_type_missing_required_fields(client):
    async def override_get_db_session():
        session = AsyncMock()
        session.add = MagicMock()
        session.execute = AsyncMock(return_value=_empty_scalar_result())
        yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    response = client.post(
        "/api/admin/document-types",
        json={"name": "Missing Code"},
    )

    assert response.status_code == 422
