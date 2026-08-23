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

TEST_ADVISER_CLAIMS = {
    "role": "adviser",
}


@pytest.fixture
def client():
    async def override_get_current_user():
        return TEST_ADVISER_CLAIMS

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
def adviser():
    return SimpleNamespace(id=uuid4())


@pytest.fixture
def assigned_department_id():
    return uuid4()


@pytest.fixture
def other_department_id():
    return uuid4()


class TestSubmissionsDepartmentFilter:
    def test_forwards_department_id_to_service(
        self, client, adviser, assigned_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_school_year_id", new_callable=AsyncMock, return_value=uuid4()):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    with patch(
                        "app.routers.adviser.svc_list_submissions",
                        new_callable=AsyncMock,
                        return_value=[],
                    ) as mock_list:
                        response = client.get(
                            "/api/adviser/submissions",
                            params={"department_id": str(assigned_department_id)},
                        )

        assert response.status_code == 200
        # The department_id must be forwarded into the service call.
        assert mock_list.call_args.args[3] == assigned_department_id

    def test_forbidden_when_department_not_assigned(
        self, client, adviser, assigned_department_id, other_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_school_year_id", new_callable=AsyncMock, return_value=uuid4()):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    response = client.get(
                        "/api/adviser/submissions",
                        params={"department_id": str(other_department_id)},
                    )

        assert response.status_code == 403

    def test_defaults_to_all_departments(
        self, client, adviser, assigned_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_school_year_id", new_callable=AsyncMock, return_value=uuid4()):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    with patch(
                        "app.routers.adviser.svc_list_submissions",
                        new_callable=AsyncMock,
                        return_value=[],
                    ) as mock_list:
                        response = client.get("/api/adviser/submissions")

        assert response.status_code == 200
        # Without a department filter, the service receives department_id=None.
        assert mock_list.call_args.args[3] is None


class TestStudentsDepartmentFilter:
    def test_forwards_department_id_to_service(
        self, client, adviser, assigned_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_school_year_id", new_callable=AsyncMock, return_value=uuid4()):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    with patch(
                        "app.routers.adviser.svc_list_students",
                        new_callable=AsyncMock,
                        return_value=[],
                    ) as mock_list:
                        response = client.get(
                            "/api/adviser/students",
                            params={"department_id": str(assigned_department_id)},
                        )

        assert response.status_code == 200
        assert mock_list.call_args.args[3] == assigned_department_id

    def test_forbidden_when_department_not_assigned(
        self, client, adviser, assigned_department_id, other_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch("app.routers.adviser.get_school_year_id", new_callable=AsyncMock, return_value=uuid4()):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    response = client.get(
                        "/api/adviser/students",
                        params={"department_id": str(other_department_id)},
                    )

        assert response.status_code == 403


class TestAnalyticsDepartmentFilter:
    def test_forwards_department_id_to_service(
        self, client, adviser, assigned_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch(
                "app.routers.adviser.get_active_school_year_id",
                new_callable=AsyncMock,
                return_value=uuid4(),
            ):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    with patch(
                        "app.routers.adviser.svc_get_analytics",
                        new_callable=AsyncMock,
                        return_value={
                            "totalStudents": 1,
                            "pendingReviews": 0,
                            "submittedToday": 0,
                            "verifiedCount": 0,
                            "progressPercent": 0,
                        },
                    ) as mock_analytics:
                        response = client.get(
                            "/api/adviser/analytics",
                            params={"department_id": str(assigned_department_id)},
                        )

        assert response.status_code == 200
        assert mock_analytics.call_args.args[2] == assigned_department_id

    def test_forbidden_when_department_not_assigned(
        self, client, adviser, assigned_department_id, other_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch(
                "app.routers.adviser.get_active_school_year_id",
                new_callable=AsyncMock,
                return_value=uuid4(),
            ):
                with patch(
                    "app.routers.adviser.get_department_ids_for_adviser",
                    new_callable=AsyncMock,
                    return_value=[assigned_department_id],
                ):
                    response = client.get(
                        "/api/adviser/analytics",
                        params={"department_id": str(other_department_id)},
                    )

        assert response.status_code == 403


class TestArchivedDepartmentFilter:
    def test_forwards_department_id_to_service(
        self, client, adviser, assigned_department_id,
    ):
        school_year_id = uuid4()
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch(
                "app.routers.adviser.get_department_ids_for_adviser",
                new_callable=AsyncMock,
                return_value=[assigned_department_id],
            ):
                with patch(
                    "app.routers.adviser.svc_get_archived",
                    new_callable=AsyncMock,
                    return_value={
                        "analytics": {
                            "school_year": "2025-2026",
                            "total_students": 0,
                            "total_submissions": 0,
                            "verification_rate": 0,
                            "avg_processing_days": None,
                            "status_distribution": [],
                            "monthly_submissions": [],
                            "student_status_distribution": [],
                            "student_completion_rate": 0,
                        },
                        "students": [],
                    },
                ) as mock_archived:
                    response = client.get(
                        "/api/adviser/archived",
                        params={
                            "school_year_id": str(school_year_id),
                            "department_id": str(assigned_department_id),
                        },
                    )

        assert response.status_code == 200
        assert mock_archived.call_args.args[3] == assigned_department_id

    def test_forbidden_when_department_not_assigned(
        self, client, adviser, assigned_department_id, other_department_id,
    ):
        school_year_id = uuid4()
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch(
                "app.routers.adviser.get_department_ids_for_adviser",
                new_callable=AsyncMock,
                return_value=[assigned_department_id],
            ):
                response = client.get(
                    "/api/adviser/archived",
                    params={
                        "school_year_id": str(school_year_id),
                        "department_id": str(other_department_id),
                    },
                )

        assert response.status_code == 403


class TestAdviserDepartmentsEndpoint:
    def test_returns_departments_for_adviser(
        self, client, adviser, assigned_department_id,
    ):
        with patch("app.routers.adviser.resolve_adviser", new_callable=AsyncMock, return_value=adviser):
            with patch(
                "app.routers.adviser.get_school_year_id",
                new_callable=AsyncMock,
                return_value=uuid4(),
            ):
                with patch(
                    "app.routers.adviser.list_adviser_departments",
                    new_callable=AsyncMock,
                    return_value=[
                        {"id": str(assigned_department_id), "name": "BSIT", "code": "bsit"},
                    ],
                ):
                    response = client.get("/api/adviser/departments")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(assigned_department_id)
        assert data[0]["name"] == "BSIT"
