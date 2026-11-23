"""Deactivating an adviser who still holds programs for the active school year is refused.

Clerk and the database are mocked. The guard runs before any Clerk lock call, so a refused
request must not lock the account.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import UserRole
from app.routers.admin import adviser_management as adv_router

ADMIN = {"sub": "clerk_admin"}
DEACTIVATE = adv_router.AdviserStatusUpdateRequest(is_active=False)


def _adviser_and_user():
    user = SimpleNamespace(
        id=uuid4(),
        clerk_user_id="user_guard",
        role=UserRole.ADVISER,
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.edu",
    )
    adviser = SimpleNamespace(id=uuid4(), user_id=user.id, created_at=datetime.now(timezone.utc))
    return adviser, user


def _db(adviser, user):
    row = MagicMock()
    row.first.return_value = (adviser, user)
    # The open school years the guard checks: one year, the 2026-2027 year.
    row.all.return_value = [(uuid4(), "2026-2027")]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=row)
    db.get = AsyncMock(return_value=SimpleNamespace(name="2026-2027"))
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_deactivation_is_refused_while_the_adviser_has_a_program_this_year():
    adviser, user = _adviser_and_user()
    db = _db(adviser, user)
    lock = AsyncMock(return_value=True)

    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "lock_user_account", lock),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(return_value=uuid4())),
        patch.object(
            adv_router,
            "get_adviser_departments_map_for_school_year",
            AsyncMock(return_value={adviser.id: ["BSIT", "BSCS"]}),
        ),
    ):
        with pytest.raises(HTTPException) as info:
            await adv_router.update_adviser_status(adviser.id, DEACTIVATE, ADMIN, db)

    assert info.value.status_code == 409
    assert "BSCS, BSIT" in info.value.detail
    assert "Reassign or remove" in info.value.detail
    lock.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_deactivation_is_allowed_when_the_adviser_has_no_program_this_year():
    adviser, user = _adviser_and_user()
    db = _db(adviser, user)
    lock = AsyncMock(return_value=True)

    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "lock_user_account", lock),
        # Called once by the guard and once for the response.
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(side_effect=[uuid4(), uuid4()])),
        patch.object(adv_router, "get_adviser_departments_map_for_school_year", AsyncMock(return_value={})),
        patch.object(adv_router, "record_activity", AsyncMock()),
    ):
        await adv_router.update_adviser_status(adviser.id, DEACTIVATE, ADMIN, db)

    lock.assert_awaited_once_with(user.clerk_user_id)


@pytest.mark.asyncio
async def test_programs_in_an_open_school_year_block_deactivation_even_without_an_active_year():
    # Only the active year is not the test here: a program in any open year blocks deactivation.
    adviser, user = _adviser_and_user()
    db = _db(adviser, user)
    lock = AsyncMock(return_value=True)

    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "lock_user_account", lock),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(return_value=None)),
        patch.object(
            adv_router,
            "get_adviser_departments_map_for_school_year",
            AsyncMock(return_value={adviser.id: ["BSIT"]}),
        ),
    ):
        with pytest.raises(HTTPException) as info:
            await adv_router.update_adviser_status(adviser.id, DEACTIVATE, ADMIN, db)

    assert info.value.status_code == 409
    assert "BSIT (2026-2027)" in info.value.detail
    lock.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_already_locked_adviser_is_not_blocked_by_the_guard():
    # The guard applies to the change itself. A repeated deactivation gets the idempotent response.
    adviser, user = _adviser_and_user()
    db = _db(adviser, user)
    lock = AsyncMock(return_value=True)

    with (
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=True)),
        patch.object(adv_router, "lock_user_account", lock),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(side_effect=[uuid4(), uuid4()])),
        patch.object(
            adv_router,
            "get_adviser_departments_map_for_school_year",
            AsyncMock(return_value={adviser.id: ["BSIT"]}),
        ),
        patch.object(adv_router, "record_activity", AsyncMock()),
    ):
        await adv_router.update_adviser_status(adviser.id, DEACTIVATE, ADMIN, db)

    lock.assert_awaited_once()
