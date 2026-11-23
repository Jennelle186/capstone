"""Deactivated (Clerk-locked) accounts are refused on every request, and the Academic Programs
adviser list shows the lock state.

Clerk and the database are mocked.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app import auth
from app.models import UserRole
from app.routers.admin import departments as dept_router
from app.services import clerk


@pytest.fixture(autouse=True)
def _clean_lock_cache(monkeypatch):
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_placeholder")
    clerk._lock_cache.clear()
    yield
    clerk._lock_cache.clear()


CREDENTIALS = SimpleNamespace(scheme="Bearer", credentials="token-value")


# ---------- request check -------------------------------------------------------

@pytest.mark.asyncio
async def test_a_locked_account_gets_423_on_every_request():
    claims = {"sub": "user_locked", "role": "adviser"}
    with (
        patch.object(auth, "verify_token", MagicMock(return_value=claims)),
        patch.object(auth, "is_user_locked", AsyncMock(return_value=True)),
    ):
        with pytest.raises(HTTPException) as info:
            await auth.get_current_user(CREDENTIALS)

    assert info.value.status_code == auth.ACCOUNT_DEACTIVATED_STATUS == 423
    assert info.value.detail == auth.ACCOUNT_DEACTIVATED_DETAIL


@pytest.mark.asyncio
async def test_an_unlocked_account_gets_its_claims():
    claims = {"sub": "user_ok", "role": "adviser"}
    with (
        patch.object(auth, "verify_token", MagicMock(return_value=claims)),
        patch.object(auth, "is_user_locked", AsyncMock(return_value=False)),
    ):
        result = await auth.get_current_user(CREDENTIALS)

    assert result == claims


@pytest.mark.asyncio
async def test_lock_state_is_cached_so_each_request_does_not_call_clerk():
    fetch = AsyncMock(return_value=False)
    with patch.object(clerk, "fetch_user_lock_status", fetch):
        assert await clerk.is_user_locked("user_cached") is False
        assert await clerk.is_user_locked("user_cached") is False

    fetch.assert_awaited_once_with("user_cached")


@pytest.mark.asyncio
async def test_locking_or_unlocking_clears_the_cached_state():
    fetch = AsyncMock(return_value=False)
    with patch.object(clerk, "fetch_user_lock_status", fetch):
        await clerk.is_user_locked("user_change")
        clerk.forget_lock_state("user_change")
        await clerk.is_user_locked("user_change")

    assert fetch.await_count == 2


@pytest.mark.asyncio
async def test_an_unknown_lock_state_lets_the_request_through_and_is_not_cached():
    # Clerk unreachable: an outage must not lock every user out. The state is not cached,
    # so the next request asks again.
    fetch = AsyncMock(return_value=None)
    with patch.object(clerk, "fetch_user_lock_status", fetch):
        assert await clerk.is_user_locked("user_unknown") is False
        assert await clerk.is_user_locked("user_unknown") is False

    # The unknown state is remembered briefly, so Clerk is asked once, not per request.
    assert fetch.await_count == 1
    assert "user_unknown" not in clerk._lock_cache


@pytest.mark.asyncio
async def test_an_unknown_lock_state_is_logged_as_a_warning(caplog):
    with patch.object(clerk, "fetch_user_lock_status", AsyncMock(return_value=None)):
        with caplog.at_level("WARNING", logger="app.services.clerk"):
            await clerk.is_user_locked("user_warn")

    assert any("Lock state unknown" in record.getMessage() for record in caplog.records)


# ---------- Academic Programs adviser list -------------------------------------

def _adviser_and_user(clerk_user_id: str, role: UserRole = UserRole.ADVISER):
    user = SimpleNamespace(
        id=uuid4(),
        clerk_user_id=clerk_user_id,
        role=role,
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.edu",
    )
    adviser = SimpleNamespace(id=uuid4(), user_id=user.id, created_at=datetime.now(timezone.utc))
    return adviser, user


@pytest.mark.asyncio
async def test_academic_programs_list_shows_a_locked_adviser_as_inactive():
    locked_adviser, locked_user = _adviser_and_user("user_locked_adv")
    active_adviser, active_user = _adviser_and_user("user_active_adv")
    row = MagicMock()
    row.all.return_value = [(locked_adviser, locked_user), (active_adviser, active_user)]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=row)

    with (
        patch.object(dept_router, "get_active_school_year_id", AsyncMock(return_value=uuid4())),
        patch.object(
            dept_router,
            "get_adviser_departments_map_for_school_year",
            AsyncMock(return_value={locked_adviser.id: ["BSIT"], active_adviser.id: ["BSCS"]}),
        ),
        patch.object(
            dept_router,
            "fetch_users_lock_status",
            AsyncMock(return_value={"user_locked_adv": True, "user_active_adv": False}),
        ),
    ):
        result = await dept_router.list_advisers_for_department_assignment(
            school_year_id=None, current_user={"sub": "admin"}, db=db
        )

    by_id = {item.id: item for item in result}
    assert by_id[str(locked_adviser.id)].is_active is False
    assert by_id[str(active_adviser.id)].is_active is True
    # The assignment is still shown, so the admin can see what needs reassigning.
    assert by_id[str(locked_adviser.id)].departments == ["BSIT"]


@pytest.mark.asyncio
async def test_academic_programs_list_treats_an_unknown_lock_state_as_active():
    adviser, user = _adviser_and_user("user_unknown_adv")
    row = MagicMock()
    row.all.return_value = [(adviser, user)]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=row)

    with (
        patch.object(dept_router, "get_active_school_year_id", AsyncMock(return_value=None)),
        patch.object(dept_router, "get_adviser_departments_map_for_school_year", AsyncMock(return_value={})),
        patch.object(dept_router, "fetch_users_lock_status", AsyncMock(return_value={"user_unknown_adv": None})),
    ):
        result = await dept_router.list_advisers_for_department_assignment(
            school_year_id=None, current_user={"sub": "admin"}, db=db
        )

    assert result[0].is_active is True


# ---------- inactive advisers cannot be given new programs ---------------------

from app.services import adviser_core
from app.services.helpers import program_uuid_for_department_code


@pytest.mark.asyncio
async def test_a_locked_adviser_cannot_be_given_a_new_program():
    held = {program_uuid_for_department_code("BSIT")}
    with patch.object(adviser_core, "fetch_user_lock_status", AsyncMock(return_value=True)):
        with pytest.raises(HTTPException) as info:
            await adviser_core.ensure_inactive_adviser_gets_no_new_programs("user_locked", ["BSIT", "BSCS"], held)

    assert info.value.status_code == 409
    assert "Activate the adviser" in info.value.detail


@pytest.mark.asyncio
async def test_a_locked_adviser_can_still_keep_or_lose_programs():
    held = {program_uuid_for_department_code("BSIT")}
    fetch = AsyncMock(return_value=True)
    with patch.object(adviser_core, "fetch_user_lock_status", fetch):
        # Keeping BSIT and removing everything else is not a new assignment.
        await adviser_core.ensure_inactive_adviser_gets_no_new_programs("user_locked", ["BSIT"], held)
        await adviser_core.ensure_inactive_adviser_gets_no_new_programs("user_locked", [], held)

    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_active_adviser_can_be_given_a_program():
    with patch.object(adviser_core, "fetch_user_lock_status", AsyncMock(return_value=False)):
        await adviser_core.ensure_inactive_adviser_gets_no_new_programs("user_active", ["BSCS"], set())


@pytest.mark.asyncio
async def test_an_unknown_lock_state_does_not_block_an_assignment():
    with patch.object(adviser_core, "fetch_user_lock_status", AsyncMock(return_value=None)):
        await adviser_core.ensure_inactive_adviser_gets_no_new_programs("user_unknown", ["BSCS"], set())


# ---------- an admin who is also an adviser can be assigned ---------------------

from app.routers.admin.adviser_management import _resolve_is_active


def test_an_admin_with_an_adviser_profile_is_active_unless_locked():
    assert _resolve_is_active(UserRole.ADMIN, False) is True
    assert _resolve_is_active(UserRole.ADMIN, True) is False
    assert _resolve_is_active(UserRole.ADMIN, None) is True


def test_a_student_is_never_an_active_adviser():
    assert _resolve_is_active(UserRole.STUDENT, False) is False


@pytest.mark.asyncio
async def test_an_account_last_seen_locked_stays_blocked_during_an_outage():
    clerk._last_known_locked["user_was_locked"] = True
    with patch.object(clerk, "fetch_user_lock_status", AsyncMock(return_value=None)):
        assert await clerk.is_user_locked("user_was_locked") is True
    clerk._last_known_locked.pop("user_was_locked", None)


@pytest.mark.asyncio
async def test_an_account_last_seen_unlocked_stays_allowed_during_an_outage():
    clerk._last_known_locked["user_was_open"] = False
    with patch.object(clerk, "fetch_user_lock_status", AsyncMock(return_value=None)):
        assert await clerk.is_user_locked("user_was_open") is False
    clerk._last_known_locked.pop("user_was_open", None)
