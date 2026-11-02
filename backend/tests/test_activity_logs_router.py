from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session

ADMIN_CLAIMS = {"role": "admin", "sub": "clerk_admin"}
ADVISER_CLAIMS = {"role": "adviser", "sub": "clerk_adviser"}


@pytest.fixture
def make_client():
    """Build a TestClient whose auth claims are set per test."""

    created = []

    def _make(claims):
        async def override_get_current_user():
            return claims

        async def override_get_db_session():
            session = AsyncMock()
            session.add = MagicMock()
            yield session

        @asynccontextmanager
        async def noop_lifespan(_app):
            yield

        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db_session] = override_get_db_session
        original = app.router.lifespan_context
        app.router.lifespan_context = noop_lifespan
        created.append(original)
        return TestClient(app)

    yield _make

    app.dependency_overrides.clear()
    if created:
        app.router.lifespan_context = created[0]


def test_admin_gets_paginated_activity_logs(make_client):
    with patch(
        "app.routers.admin.activity_logs.list_activity_logs",
        new=AsyncMock(return_value=([], 0)),
    ) as listed:
        client = make_client(ADMIN_CLAIMS)
        response = client.get("/api/admin/activity-logs?skip=5&limit=10&action=update")

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}
    kwargs = listed.await_args.kwargs
    assert kwargs["skip"] == 5
    assert kwargs["limit"] == 10
    assert kwargs["action"] == "update"


def test_non_admin_is_forbidden(make_client):
    client = make_client(ADVISER_CLAIMS)
    response = client.get("/api/admin/activity-logs")

    assert response.status_code in (401, 403)


def test_limit_above_maximum_is_rejected(make_client):
    client = make_client(ADMIN_CLAIMS)
    response = client.get("/api/admin/activity-logs?limit=500")

    assert response.status_code == 422
