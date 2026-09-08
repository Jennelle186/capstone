from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session


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


def _make_dimension(**overrides):
    defaults = {
        "id": uuid4(),
        "canonical_key": "shs_strand",
        "label": "SHS Strand",
        "field_type": "select",
        "analytics_group": "High School Statistics",
        "is_active": True,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _list_result(items):
    result = MagicMock()
    result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=items)))
    return result


def _scalar_result(item):
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=item)
    return result


def test_list_dimensions_returns_all(client):
    dim = _make_dimension()

    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_list_result([dim]))
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.get("/api/admin/analytics-dimensions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["canonical_key"] == "shs_strand"
    assert data[0]["label"] == "SHS Strand"


def test_list_dimensions_active_only(client):
    dim = _make_dimension()

    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_list_result([dim]))
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.get("/api/admin/analytics-dimensions?active_only=true")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_create_dimension_success(client):
    dim = _make_dimension()

    async def fake_refresh(obj):
        obj.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        obj.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

    async def override_db():
        session = AsyncMock()
        session.add = MagicMock()
        # First execute is the duplicate check (returns None).
        session.execute = AsyncMock(return_value=_scalar_result(None))
        session.refresh = AsyncMock(side_effect=fake_refresh)
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.post(
        "/api/admin/analytics-dimensions",
        json={
            "canonical_key": "gpa",
            "label": "GPA",
            "field_type": "number",
            "analytics_group": "High School Statistics",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["canonical_key"] == "gpa"


def test_create_dimension_duplicate_conflict(client):
    existing = _make_dimension(canonical_key="shs_strand")

    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_scalar_result(existing))
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.post(
        "/api/admin/analytics-dimensions",
        json={
            "canonical_key": "shs_strand",
            "label": "SHS Strand",
            "field_type": "select",
        },
    )
    assert response.status_code == 409


def test_create_dimension_invalid_field_type(client):
    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(return_value=_scalar_result(None))
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.post(
        "/api/admin/analytics-dimensions",
        json={
            "canonical_key": "gpa",
            "label": "GPA",
            "field_type": "not_a_real_type",
        },
    )
    assert response.status_code == 422


def test_update_dimension_success(client):
    dim = _make_dimension()

    async def override_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=dim)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.patch(
        f"/api/admin/analytics-dimensions/{dim.id}",
        json={"label": "Updated Strand"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "Updated Strand"


def test_update_dimension_empty_body(client):
    dim = _make_dimension()

    async def override_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=dim)
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.patch(
        f"/api/admin/analytics-dimensions/{dim.id}",
        json={},
    )
    assert response.status_code == 400


def test_update_dimension_not_found(client):
    async def override_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.patch(
        f"/api/admin/analytics-dimensions/{uuid4()}",
        json={"label": "X"},
    )
    assert response.status_code == 404


def test_deactivate_dimension(client):
    dim = _make_dimension()

    async def override_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=dim)
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.delete(f"/api/admin/analytics-dimensions/{dim.id}")
    assert response.status_code == 200
    assert dim.is_active is False


def test_deactivate_dimension_not_found(client):
    async def override_db():
        session = AsyncMock()
        session.get = AsyncMock(return_value=None)
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.delete(f"/api/admin/analytics-dimensions/{uuid4()}")
    assert response.status_code == 404


def test_list_unregistered_keys(client):
    """Unregistered endpoint returns schema fields not in registry."""
    schema = SimpleNamespace(
        id=uuid4(),
        name="Student Info",
        fields_json=[
            {
                "key": "religion",
                "is_analytics": True,
                "analytics_label": "Religion",
            }
        ],
    )
    dim = _make_dimension(canonical_key="gender")
    syr = SimpleNamespace(
        extraction_schema_id=schema.id,
        school_year_id=uuid4(),
    )
    sy = SimpleNamespace(id=syr.school_year_id, name="2026-2027")

    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(
            side_effect=[
                _list_result([dim]),           # active registry dims
                _list_result([schema]),        # all schemas
                _list_result([syr]),           # all syrs
                _list_result([sy]),            # batch school years
            ]
        )
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.get("/api/admin/analytics-dimensions/unregistered")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["canonical_key"] == "religion"
    assert data[0]["schema_name"] == "Student Info"
    assert data[0]["school_year_name"] == "2026-2027"
    assert data[0]["field_label"] == "Religion"


def test_list_unregistered_keys_excludes_inactive_dimensions(client):
    """Unregistered endpoint treats inactive keys as registered (not orphaned)."""
    schema = SimpleNamespace(
        id=uuid4(),
        name="Student Info",
        fields_json=[
            {
                "key": "employment_nature",
                "is_analytics": True,
                "analytics_label": "Employment Nature",
            }
        ],
    )
    dim = _make_dimension(canonical_key="employment_nature", is_active=False)
    syr = SimpleNamespace(
        extraction_schema_id=schema.id,
        school_year_id=uuid4(),
    )
    sy = SimpleNamespace(id=syr.school_year_id, name="2026-2027")

    async def override_db():
        session = AsyncMock()
        session.execute = AsyncMock(
            side_effect=[
                _list_result([dim]),           # all registry dims (incl. inactive)
                _list_result([schema]),        # all schemas
                _list_result([syr]),           # all syrs
                _list_result([sy]),            # batch school years
            ]
        )
        yield session

    app.dependency_overrides[get_db_session] = override_db

    response = client.get("/api/admin/analytics-dimensions/unregistered")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0
