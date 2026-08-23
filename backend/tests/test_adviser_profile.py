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


def _make_profile_payload(first_name="Jane", last_name="Doe"):
    """Build a user object shaped like the profile endpoint expects."""
    return SimpleNamespace(
        first_name=first_name,
        middle_name=None,
        last_name=last_name,
        email="jane@example.com",
    )


class TestAdviserProfileDepartments:
    def test_returns_all_departments_in_list(
        self, client,
    ):
        department_names = ["BSIT", "BSCS"]
        user = _make_profile_payload()

        with patch(
            "app.routers.users._ensure_adviser_profile_row",
            new_callable=AsyncMock,
            return_value=(user, SimpleNamespace(id=uuid4())),
        ), patch(
            "app.routers.users._get_active_assignment_for_adviser",
            new_callable=AsyncMock,
            return_value=(department_names, "2025-2026"),
        ):
            response = client.get("/api/adviser/profile")

        assert response.status_code == 200
        data = response.json()
        # The full list of departments is exposed under `departments`.
        assert data["departments"] == ["BSIT", "BSCS"]
        # Legacy singular field is kept for backward compatibility.
        assert data["department"] == "BSIT"
        assert data["school_year"] == "2025-2026"

    def test_single_department_still_populates_legacy_field(
        self, client,
    ):
        user = _make_profile_payload()

        with patch(
            "app.routers.users._ensure_adviser_profile_row",
            new_callable=AsyncMock,
            return_value=(user, SimpleNamespace(id=uuid4())),
        ), patch(
            "app.routers.users._get_active_assignment_for_adviser",
            new_callable=AsyncMock,
            return_value=(["BSIT"], "2025-2026"),
        ):
            response = client.get("/api/adviser/profile")

        assert response.status_code == 200
        data = response.json()
        assert data["departments"] == ["BSIT"]
        assert data["department"] == "BSIT"

    def test_empty_departments_returns_empty_list_and_null_legacy(
        self, client,
    ):
        user = _make_profile_payload()

        with patch(
            "app.routers.users._ensure_adviser_profile_row",
            new_callable=AsyncMock,
            return_value=(user, SimpleNamespace(id=uuid4())),
        ), patch(
            "app.routers.users._get_active_assignment_for_adviser",
            new_callable=AsyncMock,
            return_value=([], None),
        ):
            response = client.get("/api/adviser/profile")

        assert response.status_code == 200
        data = response.json()
        assert data["departments"] == []
        assert data["department"] is None