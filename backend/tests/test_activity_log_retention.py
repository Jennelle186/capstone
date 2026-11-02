from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import ActivityLogSettings, UserRole
from app.routers.admin.users import UpdateRoleRequest, update_user_role
from app.services import activity_log as svc


def _scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _db(*results):
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.add = MagicMock()
    return db


# ---- diff_values ----------------------------------------------------------

def test_diff_values_returns_only_changed_keys():
    previous, new = svc.diff_values(
        {"first_name": "Juan", "email": "a@x.edu", "departments": ["BSIT"]},
        {"first_name": "Johnny", "email": "a@x.edu", "departments": ["BSIT"]},
    )

    assert previous == {"first_name": "Juan"}
    assert new == {"first_name": "Johnny"}


def test_diff_values_returns_none_when_nothing_changed():
    assert svc.diff_values({"a": 1}, {"a": 1}) == (None, None)


# ---- retention policy -----------------------------------------------------

@pytest.mark.asyncio
async def test_missing_settings_row_uses_default_retention():
    db = _db(_scalar(None))

    assert await svc.get_retention_days(db) == svc.DEFAULT_RETENTION_DAYS


@pytest.mark.asyncio
async def test_null_retention_means_keep_forever():
    db = _db(_scalar(ActivityLogSettings(id=1, retention_days=None)))

    assert await svc.get_retention_days(db) is None


@pytest.mark.asyncio
async def test_set_retention_rejects_unsupported_period_before_touching_db():
    db = _db()

    with pytest.raises(HTTPException) as exc:
        await svc.set_retention_days(db, 45, {"sub": "clerk_admin"})

    assert exc.value.status_code == 400
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_manual_purge_rejects_keep_forever_style_values():
    db = _db()

    with pytest.raises(HTTPException) as exc:
        await svc.purge_logs_manually(db, 7, {"sub": "clerk_admin"})

    assert exc.value.status_code == 400
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_apply_retention_skips_delete_when_keep_forever():
    db = _db(_scalar(ActivityLogSettings(id=1, retention_days=None)))
    db.commit = AsyncMock()

    deleted = await svc.apply_retention_policy(db)

    assert deleted == 0
    # Only the settings read ran; no DELETE was issued.
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_apply_retention_deletes_rows_past_the_period():
    delete_result = MagicMock()
    delete_result.rowcount = 7
    db = _db(_scalar(ActivityLogSettings(id=1, retention_days=90)), delete_result)
    db.commit = AsyncMock()

    deleted = await svc.apply_retention_policy(db)

    assert deleted == 7
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_manual_purge_is_audited_after_delete():
    delete_result = MagicMock()
    delete_result.rowcount = 3
    # 1st execute: the DELETE. 2nd: actor lookup inside record_activity.
    db = _db(delete_result, _scalar(None))
    db.commit = AsyncMock()

    with patch.object(svc, "record_activity", new=AsyncMock()) as recorded:
        deleted = await svc.purge_logs_manually(db, 90, {"sub": "clerk_admin"})

    assert deleted == 3
    kwargs = recorded.await_args.kwargs
    assert kwargs["action"] == "purge"
    assert kwargs["new_values"] == {"older_than_days": 90, "deleted_count": 3}
    db.commit.assert_awaited_once()


# ---- People module instrumentation ----------------------------------------

@pytest.mark.asyncio
async def test_role_change_is_recorded_with_old_and_new_role():
    user = SimpleNamespace(
        id=uuid4(),
        clerk_user_id="user_staff",
        email="staff@example.edu",
        role=UserRole.ADMIN,
    )
    admin_count = MagicMock()
    admin_count.scalar_one.return_value = 2  # the last-admin guard counts admins; another admin remains
    db = _db(_scalar(user), admin_count)
    db.commit = AsyncMock()

    with (
        patch("app.routers.admin.users.record_activity", new=AsyncMock()) as recorded,
        patch("app.routers.admin.users.sync_user_role", new=AsyncMock()),
    ):
        await update_user_role(
            str(user.id),
            UpdateRoleRequest(new_role="adviser"),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    kwargs = recorded.await_args.kwargs
    assert kwargs["entity_type"] == "user_role"
    assert kwargs["previous_values"] == {"role": "admin"}
    assert kwargs["new_values"] == {"role": "adviser"}
    db.commit.assert_awaited_once()
