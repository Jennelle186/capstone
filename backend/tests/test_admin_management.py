"""Tests for the admin management service (Phase: add/manage administrators)."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import Adviser, AdviserInvitationStatus, UserRole
from app.schemas.admins import AdminInviteRequest
from app.services import admin_management as svc


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(role: UserRole, **overrides):
    data = {
        "id": uuid4(),
        "role": role,
        "clerk_user_id": "clerk_123",
        "first_name": "Jane",
        "middle_name": None,
        "last_name": "Doe",
        "email": "jane@example.com",
        "created_at": _now(),
        "updated_at": _now(),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _one(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _count(n: int):
    result = MagicMock()
    result.scalar_one.return_value = n
    return result


def _adviser_profile(user_id):
    return SimpleNamespace(id=uuid4(), user_id=user_id)


async def _noop(*args, **kwargs):
    return None


# ── list ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_admins_returns_admin_users() -> None:
    admin = _user(UserRole.ADMIN, first_name="John", last_name="Smith")
    rows = MagicMock()
    rows.scalars.return_value.all.return_value = [admin]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=rows)

    result = await svc.list_admins(db)

    assert len(result) == 1
    assert result[0].name == "John Smith"
    assert result[0].email == "jane@example.com"


@pytest.mark.asyncio
async def test_list_invitations_returns_invitations() -> None:
    invitation = SimpleNamespace(
        id=uuid4(),
        email="new@example.com",
        first_name="New",
        middle_name=None,
        last_name="Admin",
        status=AdviserInvitationStatus.PENDING,
        invited_by_user_id=None,
        accepted_user_id=None,
        expires_at=_now(),
        accepted_at=None,
        created_at=_now(),
        updated_at=_now(),
    )
    rows = MagicMock()
    rows.scalars.return_value.all.return_value = [invitation]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=rows)

    result = await svc.list_invitations(db)

    assert len(result) == 1
    assert result[0].email == "new@example.com"
    assert result[0].status == "pending"


# ── invite ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invite_admin_creates_invitation(monkeypatch) -> None:
    async def fake_create_invitation(*args, **kwargs):
        return {"id": "clerk_inv_1", "status": "pending", "url": "http://invite"}

    monkeypatch.setattr(svc, "create_application_invitation", fake_create_invitation)

    async def fake_refresh(obj):
        if getattr(obj, "id", None) is None and hasattr(obj, "id"):
            obj.id = uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = _now()
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = _now()

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_one(None), _one(None)])
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=fake_refresh)

    payload = AdminInviteRequest(email="New@Example.com", first_name="New", middle_name=None, last_name="Admin")

    result = await svc.invite_admin(db, payload, {})

    assert result.email == "new@example.com"
    assert result.status == "pending"
    # One AdminInvitation was persisted.
    added = [c.args[0] for c in db.add.call_args_list if hasattr(c.args[0], "clerk_invitation_id")]
    assert len(added) == 1
    assert added[0].clerk_invitation_id == "clerk_inv_1"


@pytest.mark.asyncio
async def test_invite_admin_rejects_existing_admin() -> None:
    existing = _user(UserRole.ADMIN)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_one(existing))

    payload = AdminInviteRequest(email="jane@example.com", first_name="Jane", middle_name=None, last_name="Doe")

    with pytest.raises(HTTPException) as exc:
        await svc.invite_admin(db, payload, {})

    assert exc.value.status_code == 409
    assert "already an administrator" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_invite_admin_rejects_existing_user() -> None:
    existing = _user(UserRole.STUDENT)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_one(existing))

    payload = AdminInviteRequest(email="jane@example.com", first_name="Jane", middle_name=None, last_name="Doe")

    with pytest.raises(HTTPException) as exc:
        await svc.invite_admin(db, payload, {})

    assert exc.value.status_code == 409
    assert "already belongs to an existing user" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_invite_admin_rejects_pending_invitation() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_one(None), _one(uuid4())])

    payload = AdminInviteRequest(email="jane@example.com", first_name="Jane", middle_name=None, last_name="Doe")

    with pytest.raises(HTTPException) as exc:
        await svc.invite_admin(db, payload, {})

    assert exc.value.status_code == 409
    assert "pending invitation" in exc.value.detail.lower()


# ── revoke ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_revoke_invitation_revokes(monkeypatch) -> None:
    monkeypatch.setattr(svc, "revoke_application_invitation", _noop)

    invitation = SimpleNamespace(
        id=uuid4(),
        clerk_invitation_id="clerk_inv_1",
        email="new@example.com",
        first_name="New",
        middle_name=None,
        last_name="Admin",
        status=AdviserInvitationStatus.PENDING,
        invited_by_user_id=None,
        accepted_user_id=None,
        expires_at=_now(),
        accepted_at=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock(return_value=invitation)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    result = await svc.revoke_invitation(db, invitation.id)

    assert result.status == "revoked"
    assert invitation.status == AdviserInvitationStatus.REVOKED


@pytest.mark.asyncio
async def test_revoke_invitation_rejects_non_pending() -> None:
    invitation = SimpleNamespace(
        id=uuid4(),
        clerk_invitation_id="clerk_inv_1",
        email="new@example.com",
        first_name="New",
        middle_name=None,
        last_name="Admin",
        status=AdviserInvitationStatus.ACCEPTED,
        invited_by_user_id=None,
        accepted_user_id=None,
        expires_at=_now(),
        accepted_at=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=invitation)

    with pytest.raises(HTTPException) as exc:
        await svc.revoke_invitation(db, invitation.id)

    assert exc.value.status_code == 400
    assert "only pending" in exc.value.detail.lower()


# ── promote ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_promote_adviser_sets_admin_role(monkeypatch) -> None:
    monkeypatch.setattr(svc, "update_user_public_metadata", _noop)

    user = _user(UserRole.ADVISER)
    profile = _adviser_profile(user.id)
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[profile, user])
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    result = await svc.promote_adviser(db, profile.id, {})

    assert result.name == "Jane Doe"
    assert user.role == UserRole.ADMIN


@pytest.mark.asyncio
async def test_promote_adviser_not_found() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await svc.promote_adviser(db, uuid4(), {})

    assert exc.value.status_code == 404
    assert "adviser not found" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_promote_repairs_stale_student_role(monkeypatch) -> None:
    monkeypatch.setattr(svc, "update_user_public_metadata", _noop)
    monkeypatch.setattr(svc, "unlock_user_account", _noop)

    user = _user(UserRole.STUDENT)
    profile = _adviser_profile(user.id)
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[profile, user])
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    result = await svc.promote_adviser(db, profile.id, {})

    assert result.name == "Jane Doe"
    assert user.role == UserRole.ADMIN


@pytest.mark.asyncio
async def test_promote_rejects_already_admin() -> None:
    admin = _user(UserRole.ADMIN)
    profile = _adviser_profile(admin.id)
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[profile, admin])

    with pytest.raises(HTTPException) as exc:
        await svc.promote_adviser(db, profile.id, {})

    assert exc.value.status_code == 409
    assert "already an administrator" in exc.value.detail.lower()


# ── remove ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_admin_restores_adviser(monkeypatch) -> None:
    monkeypatch.setattr(svc, "update_user_public_metadata", _noop)

    admin = _user(UserRole.ADMIN)
    profile = _adviser_profile(admin.id)
    db = AsyncMock()
    db.get = AsyncMock(return_value=admin)
    # First execute: admin count; second: adviser lookup (found → restore).
    db.execute = AsyncMock(side_effect=[_count(2), _one(profile)])
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()

    await svc.remove_admin(db, admin.id, {})

    assert admin.role == UserRole.ADVISER


@pytest.mark.asyncio
async def test_remove_admin_deletes_direct_invite(monkeypatch) -> None:
    monkeypatch.setattr(svc, "delete_user", _noop)

    admin = _user(UserRole.ADMIN)
    db = AsyncMock()
    db.get = AsyncMock(return_value=admin)
    # First execute: admin count; second: adviser lookup (none → delete user).
    db.execute = AsyncMock(side_effect=[_count(2), _one(None)])
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()

    await svc.remove_admin(db, admin.id, {})

    db.delete.assert_awaited_once_with(admin)
    assert admin.role == UserRole.ADMIN  # unchanged; the user row is deleted instead


@pytest.mark.asyncio
async def test_remove_admin_rejects_last_admin() -> None:
    admin = _user(UserRole.ADMIN)
    db = AsyncMock()
    db.get = AsyncMock(return_value=admin)
    db.execute = AsyncMock(return_value=_count(1))

    with pytest.raises(HTTPException) as exc:
        await svc.remove_admin(db, admin.id, {})

    assert exc.value.status_code == 400
    assert "last administrator" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_remove_admin_rejects_self() -> None:
    admin = _user(UserRole.ADMIN)
    db = AsyncMock()
    db.get = AsyncMock(return_value=admin)
    # First execute: _actor_user_id resolves the acting admin's id (self).
    db.execute = AsyncMock(side_effect=[_one(admin.id)])

    with pytest.raises(HTTPException) as exc:
        await svc.remove_admin(db, admin.id, {"sub": "clerk_123"})

    assert exc.value.status_code == 400
    assert "cannot remove yourself" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_remove_admin_rejects_non_admin() -> None:
    adviser = _user(UserRole.ADVISER)
    db = AsyncMock()
    db.get = AsyncMock(return_value=adviser)

    with pytest.raises(HTTPException) as exc:
        await svc.remove_admin(db, adviser.id, {})

    assert exc.value.status_code == 400
    assert "not an administrator" in exc.value.detail.lower()
