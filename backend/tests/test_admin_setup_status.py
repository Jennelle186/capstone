from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.auth import get_current_user
from app.database import get_db_session
from app.services.admin_setup_status import SetupCounts, build_setup_status


def _counts(**overrides) -> SetupCounts:
    base = dict(
        active_school_year_name="2026-2027",
        active_programs=2,
        advisers_assigned_this_year=1,
        active_document_types_with_classifications=3,
        active_schemas=1,
        requirements_this_year=2,
        branding_name_set=True,
        forms=1,
    )
    base.update(overrides)
    return SetupCounts(**base)


def _step(response, key):
    return next(step for step in response.steps if step.key == key)


def test_everything_present_is_complete():
    response = build_setup_status(_counts())

    assert response.core_complete is True
    assert response.active_school_year_name == "2026-2027"
    assert all(step.done for step in response.steps)


def test_no_active_school_year_blocks_completion_and_reports_no_name():
    response = build_setup_status(_counts(active_school_year_name=None))

    assert response.core_complete is False
    assert response.active_school_year_name is None
    assert _step(response, "school_year").done is False
    assert _step(response, "school_year").count == 0


@pytest.mark.parametrize(
    "key,overrides",
    [
        ("programs", {"active_programs": 0}),
        ("advisers", {"advisers_assigned_this_year": 0}),
        ("document_types", {"active_document_types_with_classifications": 0}),
        ("schemas", {"active_schemas": 0}),
        ("requirements", {"requirements_this_year": 0}),
    ],
)
def test_each_required_step_blocks_completion_when_missing(key, overrides):
    response = build_setup_status(_counts(**overrides))

    assert _step(response, key).done is False
    assert _step(response, key).required is True
    assert response.core_complete is False


@pytest.mark.parametrize(
    "key,overrides",
    [
        ("branding", {"branding_name_set": False}),
        ("forms", {"forms": 0}),
    ],
)
def test_optional_steps_never_block_completion(key, overrides):
    response = build_setup_status(_counts(**overrides))

    step = _step(response, key)
    assert step.done is False
    assert step.required is False
    assert response.core_complete is True


def test_counts_are_reported_for_each_step():
    response = build_setup_status(_counts(active_programs=5, forms=4))

    assert _step(response, "programs").count == 5
    assert _step(response, "forms").count == 4


@pytest.fixture
def make_client():
    created = []

    def _make(claims):
        async def override_user():
            return claims

        async def override_db():
            session = AsyncMock()
            yield session

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def noop_lifespan(_app):
            yield

        app.dependency_overrides[get_current_user] = override_user
        app.dependency_overrides[get_db_session] = override_db
        created.append(app.router.lifespan_context)
        app.router.lifespan_context = noop_lifespan
        return TestClient(app)

    yield _make

    app.dependency_overrides.clear()
    if created:
        app.router.lifespan_context = created[0]


def test_admin_gets_setup_status(make_client):
    from app.schemas.admin_setup_status import AdminSetupStatusResponse, SetupStep

    fake = AdminSetupStatusResponse(
        active_school_year_name=None,
        core_complete=False,
        steps=[SetupStep(key="school_year", done=False, count=0, required=True)],
    )
    with patch("app.routers.admin.setup_status.get_setup_status", new=AsyncMock(return_value=fake)):
        client = make_client({"role": "admin", "sub": "clerk_admin"})
        response = client.get("/api/admin/setup-status")

    assert response.status_code == 200
    assert response.json()["core_complete"] is False


def test_adviser_is_forbidden(make_client):
    client = make_client({"role": "adviser", "sub": "clerk_adviser"})
    response = client.get("/api/admin/setup-status")

    assert response.status_code in (401, 403)


def test_requirements_count_slots_without_double_counting_legacy_rows():
    from app.services.admin_setup_status import requirements_for_year

    # One solo requirement is saved as one slot plus one legacy row: it counts once.
    assert requirements_for_year(slot_rows=1, legacy_rows=1) == 1
    # A group of three alternatives is one slot plus three legacy rows: it counts once.
    assert requirements_for_year(slot_rows=1, legacy_rows=3) == 1


def test_requirements_fall_back_to_legacy_rows_for_years_without_slots():
    from app.services.admin_setup_status import requirements_for_year

    assert requirements_for_year(slot_rows=0, legacy_rows=2) == 2
    assert requirements_for_year(slot_rows=0, legacy_rows=0) == 0
