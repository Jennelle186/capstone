from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session


ADMIN_CLAIMS = {
    "sub": "clerk_admin_456",
    "sid": "session_admin",
    "email": "admin@example.com",
    "role": "admin",
}

VALID_PAYLOAD = {
    "name": "Report Card",
    "code": "REPORT_CARD",
    "description": "A student report card containing quarterly grades and attendance records.",
    "applicable_classifications": ["freshman", "transferee"],
}

MOCK_RESULT = {
    "classifier_description": "Report cards feature tables with rows per subject and columns for quarters and final grades. Look for headers like 'Report Card', 'Quarterly Grades', 'Grading Period', student name, and school seal.",
    "keywords": [
        "report card",
        "quarterly grades",
        "grading period",
        "subjects",
        "final grade",
        "parent signature",
        "academic year",
    ],
    "reasoning": "Report cards have a distinct table layout with subject rows and quarter columns. Keywords target both the document title and the characteristic data labels found in academic report cards.",
}


@pytest.fixture
def client():
    async def override_get_current_user():
        return ADMIN_CLAIMS

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


def test_generate_classification_success(client):
    with patch(
        "app.routers.admin.document_management.generate_classification_settings",
        return_value=MOCK_RESULT,
    ):
        response = client.post(
            "/api/admin/document-types/generate-classification",
            json=VALID_PAYLOAD,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["classifier_description"] == MOCK_RESULT["classifier_description"]
    assert data["keywords"] == MOCK_RESULT["keywords"]
    assert data["reasoning"] == MOCK_RESULT["reasoning"]


def test_generate_classification_handles_gemini_failure(client):
    with patch(
        "app.routers.admin.document_management.generate_classification_settings",
        side_effect=__import__("app.services.gcp_pipeline", fromlist=["GcpPipelineError"]).GcpPipelineError(
            "Gemini timed out"
        ),
    ):
        response = client.post(
            "/api/admin/document-types/generate-classification",
            json=VALID_PAYLOAD,
        )

    assert response.status_code == 502
    detail = response.json().get("detail", "")
    assert "Gemini" in detail


def test_generate_classification_validates_empty_name(client):
    response = client.post(
        "/api/admin/document-types/generate-classification",
        json={**VALID_PAYLOAD, "name": ""},
    )
    assert response.status_code == 422


def test_generate_classification_validates_missing_fields(client):
    response = client.post(
        "/api/admin/document-types/generate-classification",
        json={"name": "Only Name"},
    )
    assert response.status_code == 422
