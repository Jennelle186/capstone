"""Role changes must reach Clerk before the database is saved, because the role is
re-read from the Clerk token at sign-in."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import UserRole
from app.routers.admin import users as users_router
from app.routers.admin.users import UpdateRoleRequest, update_user_role
from app.services import clerk as clerk_svc

ADMIN = {"sub": "clerk_admin"}


def _db(user):
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _user(**overrides):
    base = dict(
        id=uuid4(),
        clerk_user_id="user_123",
        email="staff@example.edu",
        role=UserRole.STUDENT,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_role_change_is_written_to_clerk_then_saved():
    user = _user()
    db = _db(user)
    sync = AsyncMock()

    with (
        patch.object(users_router, "sync_user_role", sync),
        patch.object(users_router, "record_activity", AsyncMock()),
    ):
        await update_user_role(str(user.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    sync.assert_awaited_once_with("user_123", "adviser")
    assert user.role == UserRole.ADVISER
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_clerk_failure_returns_502_and_leaves_the_database_unchanged():
    user = _user(role=UserRole.STUDENT)
    db = _db(user)

    with (
        patch.object(users_router, "sync_user_role", AsyncMock(side_effect=RuntimeError("Clerk is down"))),
        patch.object(users_router, "record_activity", AsyncMock()) as recorded,
    ):
        with pytest.raises(HTTPException) as exc:
            await update_user_role(str(user.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    assert exc.value.status_code == 502
    assert "Clerk is down" in exc.value.detail
    assert user.role == UserRole.STUDENT  # not changed
    db.commit.assert_not_awaited()
    recorded.assert_not_awaited()


@pytest.mark.asyncio
async def test_db_commit_failure_reverts_the_clerk_role():
    user = _user(role=UserRole.STUDENT)
    db = _db(user)
    db.commit = AsyncMock(side_effect=RuntimeError("db is down"))
    sync = AsyncMock()

    with (
        patch.object(users_router, "sync_user_role", sync),
        patch.object(users_router, "record_activity", AsyncMock()),
    ):
        with pytest.raises(RuntimeError):
            await update_user_role(str(user.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    assert sync.await_args_list[0].args == ("user_123", "adviser")
    assert sync.await_args_list[-1].args == ("user_123", "student")  # Clerk put back
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_role_is_rejected_before_clerk_is_called():
    user = _user(role=UserRole.STUDENT)
    db = _db(user)
    sync = AsyncMock()
    with patch.object(users_router, "sync_user_role", sync):
        with pytest.raises(HTTPException) as exc:
            await update_user_role(str(user.id), UpdateRoleRequest(new_role="admin"), ADMIN, db)
    assert exc.value.status_code == 400
    sync.assert_not_awaited()


@pytest.mark.asyncio
async def test_user_without_a_clerk_account_is_rejected():
    user = _user(clerk_user_id=None)
    db = _db(user)
    sync = AsyncMock()

    with patch.object(users_router, "sync_user_role", sync):
        with pytest.raises(HTTPException) as exc:
            await update_user_role(str(user.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    assert exc.value.status_code == 400
    sync.assert_not_awaited()
    assert user.role == UserRole.STUDENT
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_user_role_raises_when_clerk_is_not_configured(monkeypatch):
    monkeypatch.setattr(clerk_svc, "_get_clerk_client", lambda: None)

    with pytest.raises(RuntimeError, match="CLERK_SECRET_KEY"):
        await clerk_svc.sync_user_role("user_123", "admin")


@pytest.mark.asyncio
async def test_sync_user_role_raises_when_clerk_call_fails(monkeypatch):
    client = MagicMock()
    client.users.update_metadata_async = AsyncMock(side_effect=ConnectionError("timeout"))
    monkeypatch.setattr(clerk_svc, "_get_clerk_client", lambda: client)

    with pytest.raises(RuntimeError, match="Failed to update the user's role"):
        await clerk_svc.sync_user_role("user_123", "admin")


@pytest.mark.asyncio
async def test_sync_user_role_writes_the_role_to_public_metadata(monkeypatch):
    client = MagicMock()
    client.users.update_metadata_async = AsyncMock(return_value=None)
    monkeypatch.setattr(clerk_svc, "_get_clerk_client", lambda: client)

    await clerk_svc.sync_user_role("user_123", "adviser")

    client.users.update_metadata_async.assert_awaited_once_with(
        user_id="user_123",
        public_metadata={"role": "adviser"},
    )


def _db_with_admin_count(user, admin_count):
    """Session whose first execute returns the target user and whose second returns the admin count."""
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user
    count_result = MagicMock()
    count_result.scalar_one.return_value = admin_count
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[user_result, count_result])
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_admin_cannot_remove_their_own_admin_role():
    me = _user(clerk_user_id="clerk_admin", role=UserRole.ADMIN)
    db = _db(me)
    sync = AsyncMock()

    with patch.object(users_router, "sync_user_role", sync):
        with pytest.raises(HTTPException) as exc:
            await update_user_role(str(me.id), UpdateRoleRequest(new_role="student"), ADMIN, db)

    assert exc.value.status_code == 400
    sync.assert_not_awaited()
    assert me.role == UserRole.ADMIN
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_last_remaining_admin_cannot_be_demoted_by_another_admin():
    other_admin = _user(clerk_user_id="clerk_other", role=UserRole.ADMIN)
    db = _db_with_admin_count(other_admin, admin_count=1)
    sync = AsyncMock()

    with patch.object(users_router, "sync_user_role", sync):
        with pytest.raises(HTTPException) as exc:
            await update_user_role(str(other_admin.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    assert exc.value.status_code == 400
    assert "last administrator" in exc.value.detail
    sync.assert_not_awaited()
    assert other_admin.role == UserRole.ADMIN
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_can_be_demoted_when_another_admin_remains():
    other_admin = _user(clerk_user_id="clerk_other", role=UserRole.ADMIN)
    db = _db_with_admin_count(other_admin, admin_count=2)
    sync = AsyncMock()

    with (
        patch.object(users_router, "sync_user_role", sync),
        patch.object(users_router, "record_activity", AsyncMock()),
    ):
        await update_user_role(str(other_admin.id), UpdateRoleRequest(new_role="adviser"), ADMIN, db)

    sync.assert_awaited_once_with("clerk_other", "adviser")
    assert other_admin.role == UserRole.ADVISER
    db.commit.assert_awaited_once()
