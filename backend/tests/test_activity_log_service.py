from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import AdminAuditLog, UserRole
from app.services import activity_log as svc


def _user(**overrides):
    base = dict(
        id=uuid4(),
        clerk_user_id="clerk_admin",
        first_name="Jane",
        middle_name=None,
        last_name="Doe",
        email="jane@example.edu",
        role=UserRole.ADMIN,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _one(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _db(actor):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_one(actor))
    db.add = MagicMock()
    return db


def test_actor_display_name_prefers_full_name_then_email_then_fallback():
    assert svc.actor_display_name(_user(middle_name="Q")) == "Jane Q Doe"
    assert svc.actor_display_name(_user(first_name=None, last_name=None)) == "jane@example.edu"
    assert svc.actor_display_name(None, fallback="clerk_x") == "clerk_x"
    assert svc.actor_display_name(None) is None


@pytest.mark.asyncio
async def test_record_activity_snapshots_actor_and_label():
    actor = _user()
    db = _db(actor)
    school_year_id = uuid4()

    row = await svc.record_activity(
        db,
        {"sub": "clerk_admin"},
        action="UPDATE",
        entity_type="adviser",
        entity_id=uuid4(),
        entity_label="Juan Cruz",
        school_year_id=school_year_id,
        previous_values={"first_name": "Juan"},
        new_values={"first_name": "Johnny"},
    )

    db.add.assert_called_once_with(row)
    assert isinstance(row, AdminAuditLog)
    assert row.action == "update"  # normalised to lowercase
    assert row.entity_type == "adviser"
    assert row.actor_user_id == actor.id
    assert row.actor_clerk_user_id == "clerk_admin"
    assert row.actor_name == "Jane Doe"
    assert row.actor_email == "jane@example.edu"
    assert row.actor_role == "admin"
    assert row.audit_metadata == {"entity_label": "Juan Cruz"}
    assert row.school_year_id == school_year_id
    assert row.previous_values == {"first_name": "Juan"}
    assert row.new_values == {"first_name": "Johnny"}


@pytest.mark.asyncio
async def test_record_activity_one_lookup_and_no_actor_keeps_clerk_id():
    db = _db(None)

    row = await svc.record_activity(db, {"sub": "clerk_gone"}, action="create", entity_type="branding")

    # Exactly one actor lookup, the same as the writers it replaced.
    assert db.execute.await_count == 1
    assert row.actor_user_id is None
    assert row.actor_name == "clerk_gone"
    assert row.actor_email is None
    assert row.audit_metadata is None


@pytest.mark.asyncio
async def test_record_activity_without_claims_skips_lookup():
    db = _db(None)

    row = await svc.record_activity(db, None, action="gcs_cleanup", entity_type="gcs_cleanup")

    db.execute.assert_not_awaited()
    assert row.actor_clerk_user_id is None
    assert row.actor_name is None


def test_to_activity_log_item_falls_back_to_live_user_for_old_rows():
    user = _user()
    old_row = SimpleNamespace(
        id=uuid4(),
        action="REASSIGN_PROGRAM",
        entity_type="adviser",
        entity_id=None,
        audit_metadata=None,
        school_year_id=None,
        actor_user_id=user.id,
        actor_clerk_user_id="clerk_admin",
        actor_name=None,
        actor_email=None,
        actor_role=None,
        previous_values=None,
        new_values={"program": "BSIT"},
        created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )

    item = svc.to_activity_log_item(old_row, user)

    assert item.action == "reassign_program"
    assert item.actor_name == "Jane Doe"
    assert item.actor_email == "jane@example.edu"
    assert item.actor_role == "admin"
    assert item.entity_label is None
    assert item.school_year_id is None


def test_to_activity_log_item_prefers_stored_snapshot():
    row = SimpleNamespace(
        id=uuid4(),
        action="create",
        entity_type="department",
        entity_id=uuid4(),
        audit_metadata={"entity_label": "BSIT"},
        school_year_id=None,
        actor_user_id=None,
        actor_clerk_user_id="clerk_admin",
        actor_name="Snapshot Name",
        actor_email="snap@example.edu",
        actor_role="admin",
        previous_values=None,
        new_values=None,
        created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )

    item = svc.to_activity_log_item(row, None)

    assert item.actor_name == "Snapshot Name"
    assert item.entity_label == "BSIT"
    assert item.actor_user_id is None


@pytest.mark.asyncio
async def test_list_activity_logs_returns_page_and_total_and_clamps_limit():
    row = (SimpleNamespace(id=uuid4()), _user())
    count_result = MagicMock()
    count_result.scalar_one.return_value = 42
    rows_result = MagicMock()
    rows_result.all.return_value = [row]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[count_result, rows_result])

    rows, total = await svc.list_activity_logs(db, skip=10, limit=5000, search="Juan", action="UPDATE")

    assert total == 42
    assert rows == [row]
    # Two queries: one count, one page.
    assert db.execute.await_count == 2
