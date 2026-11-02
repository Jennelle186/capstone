"""Regression coverage for the activity-log review fixes: approval count, search escaping,
no-op status logging, schema demotion on PATCH, the admin_demote restore path, and index parity."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import AdminAuditLog, ExtractionSchemaStatus, UserRole
from app.routers.admin import activity_logs as logs_router
from app.routers.admin import adviser_management as adv_router
from app.routers.admin import extraction_schemas as es_router
from app.schemas.extraction_schemas import ExtractionSchemaUpdateRequest
from app.services import activity_log as svc
from app.services import admin_management as admin_svc

ADMIN = {"sub": "clerk_admin"}


def _result(value=None, *, rows=None, first=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.first.return_value = first if first is not None else value
    result.all.return_value = rows if rows is not None else []
    result.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
    return result


def _db(*execute_results):
    queue = list(execute_results)

    async def _execute(*_args, **_kwargs):
        return queue.pop(0) if queue else _result(None)

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=_execute)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    return db


def _audit_rows(db) -> list[AdminAuditLog]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog)]


# ---------- approval step: count before deletion ---------------------------

@pytest.mark.asyncio
async def test_count_older_than_returns_the_number_a_purge_would_delete():
    db = _db(_result(3))
    count = await svc.count_activity_logs_older_than(db, 90)
    assert count == 3


@pytest.mark.asyncio
async def test_count_endpoint_rejects_periods_outside_the_allowed_options():
    with pytest.raises(HTTPException) as exc:
        await logs_router.count_logs_older_than(days=7, current_user=ADMIN, db=_db())
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_count_endpoint_returns_period_and_count():
    db = _db()
    with patch.object(logs_router, "count_activity_logs_older_than", AsyncMock(return_value=12)):
        response = await logs_router.count_logs_older_than(days=365, current_user=ADMIN, db=db)
    assert response.days == 365
    assert response.count == 12


# ---------- search escaping ------------------------------------------------

@pytest.mark.parametrize(
    "raw,escaped",
    [
        ("plain", "plain"),
        ("100%", "100\\%"),
        ("a_b", "a\\_b"),
        ("back\\slash", "back\\\\slash"),
    ],
)
def test_search_escapes_like_wildcards(raw, escaped):
    assert svc._escape_like(raw) == escaped


# ---------- index parity with the migration --------------------------------

def test_admin_audit_log_model_declares_the_indexes_the_migration_creates():
    names = {index.name for index in AdminAuditLog.__table__.indexes}
    assert "ix_admin_audit_logs_created_at" in names
    assert "ix_admin_audit_logs_actor_user_id" in names


# ---------- status route: log only real changes ----------------------------

def _adviser_and_user(role=UserRole.ADVISER):
    user = SimpleNamespace(
        id=uuid4(),
        clerk_user_id="user_123",
        role=role,
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.edu",
    )
    adviser = SimpleNamespace(id=uuid4(), user_id=user.id, created_at=datetime.now(timezone.utc))
    return adviser, user


@pytest.mark.asyncio
async def test_repeated_activate_of_an_unlocked_adviser_writes_no_audit_row():
    adviser, user = _adviser_and_user()
    db = _db(_result(first=(adviser, user)))
    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "unlock_user_account", AsyncMock(return_value=False)),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(return_value=None)),
        patch.object(adv_router, "get_adviser_departments_map_for_school_year", AsyncMock(return_value={})),
    ):
        await adv_router.update_adviser_status(
            adviser.id, adv_router.AdviserStatusUpdateRequest(is_active=True), ADMIN, db
        )
    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_real_reactivation_is_logged_with_previous_state():
    adviser, user = _adviser_and_user()
    db = _db(_result(first=(adviser, user)))
    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=True)),
        patch.object(adv_router, "unlock_user_account", AsyncMock(return_value=False)),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(return_value=None)),
        patch.object(adv_router, "get_adviser_departments_map_for_school_year", AsyncMock(return_value={})),
    ):
        await adv_router.update_adviser_status(
            adviser.id, adv_router.AdviserStatusUpdateRequest(is_active=True), ADMIN, db
        )
    row = _audit_rows(db)[0]
    assert row.action == "activate"
    assert row.previous_values == {"is_active": False}
    assert row.new_values == {"is_active": True}


# ---------- extraction schema PATCH to active demotes the others -----------

def _schema_obj(status):
    return SimpleNamespace(
        id=uuid4(),
        name="Enrolment",
        version_label=None,
        effective_date=None,
        description=None,
        schema_json={},
        fields_json=[],
        document_type_id=uuid4(),
        status=status,
        source_file_name=None,
        generation_prompt=None,
    )


@pytest.mark.asyncio
async def test_patch_to_active_demotes_other_active_schemas():
    schema = _schema_obj(ExtractionSchemaStatus.DRAFT)
    db = _db()
    db.get = AsyncMock(return_value=schema)
    demote = AsyncMock(return_value=1)
    with (
        patch.object(es_router, "_demote_other_active_schemas", demote),
        patch.object(es_router, "validate_analytics_fields", return_value=[]),
        patch.object(es_router, "serialize_extraction_schema", return_value={}),
    ):
        await es_router.update_extraction_schema(
            schema.id,
            ExtractionSchemaUpdateRequest(status=ExtractionSchemaStatus.ACTIVE),
            ADMIN,
            db,
        )
    demote.assert_awaited_once()


@pytest.mark.asyncio
async def test_patch_that_keeps_an_active_schema_active_does_not_demote_others():
    schema = _schema_obj(ExtractionSchemaStatus.ACTIVE)
    db = _db()
    db.get = AsyncMock(return_value=schema)
    demote = AsyncMock(return_value=0)
    with (
        patch.object(es_router, "_demote_other_active_schemas", demote),
        patch.object(es_router, "validate_analytics_fields", return_value=[]),
        patch.object(es_router, "serialize_extraction_schema", return_value={}),
    ):
        await es_router.update_extraction_schema(
            schema.id,
            ExtractionSchemaUpdateRequest(name="Renamed", status=ExtractionSchemaStatus.ACTIVE),
            ADMIN,
            db,
        )
    demote.assert_not_awaited()


# ---------- restore-to-adviser is audited as a demotion --------------------

@pytest.mark.asyncio
async def test_restoring_an_admin_to_adviser_is_logged_as_admin_demote():
    user_id = uuid4()
    user = SimpleNamespace(
        id=user_id,
        clerk_user_id=None,
        role=UserRole.ADMIN,
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.edu",
    )
    adviser = SimpleNamespace(id=uuid4(), user_id=user_id)
    db = _db(
        _result(None),       # actor lookup for the caller
        _result(2),          # two administrators, so the last-admin guard passes
        _result(adviser),    # the user has an adviser profile
    )
    db.get = AsyncMock(return_value=user)

    await admin_svc.remove_admin(db, user_id, ADMIN)

    row = _audit_rows(db)[0]
    assert row.action == "admin_demote"
    assert row.new_values == {"role": "adviser", "email": "ada@example.edu"}
    assert user.role == UserRole.ADVISER
