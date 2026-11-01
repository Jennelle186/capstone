from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import SchoolYearStatus, UserRole
from app.routers.admin.adviser_management import AdviserUpdateRequest, update_adviser
from app.services.helpers import program_uuid_for_department_code


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _make_db(held_codes, codes, department_flags):
    """Mock session whose execute() returns results in the endpoint's query order.

    Order: adviser row, school year, held program ids, one department lookup per
    requested code (``department_flags`` maps code -> is_active), email conflict.
    """
    adviser = MagicMock(id=uuid4(), created_at=datetime.now(timezone.utc))
    user = MagicMock(
        clerk_user_id="user_123",
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.com",
        role=UserRole.ADVISER,
    )
    school_year = MagicMock(id=uuid4(), status=SchoolYearStatus.ACTIVE)
    school_year.name = "2026-2027"

    adviser_result = MagicMock()
    adviser_result.first.return_value = (adviser, user)

    held_result = MagicMock()
    held_result.scalars.return_value = MagicMock(
        all=MagicMock(return_value=[program_uuid_for_department_code(c) for c in held_codes]),
    )

    department_results = [
        _scalar_result(MagicMock(is_active=department_flags[code]) if code in department_flags else None)
        for code in codes
    ]

    email_result = _scalar_result(None)

    db = MagicMock()
    db.execute = AsyncMock(
        side_effect=[adviser_result, _scalar_result(school_year), held_result, *department_results, email_result],
    )
    db.commit = AsyncMock()
    return db, adviser, user


async def _run(held_codes, codes, department_flags):
    db, _, _ = _make_db(held_codes, codes, department_flags)
    payload = AdviserUpdateRequest(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        department_codes=codes,
        school_year_name="2026-2027",
    )
    reconcile = AsyncMock(return_value=codes)
    with (
        patch(
            "app.routers.admin.adviser_management.update_user_personal_names",
            AsyncMock(return_value=("Ada", "Lovelace")),
        ),
        patch("app.routers.admin.adviser_management.fetch_user_lock_status", AsyncMock(return_value=False)),
        patch("app.routers.admin.adviser_management.reconcile_adviser_program_assignments", reconcile),
    ):
        try:
            response = await update_adviser(uuid4(), payload, current_user={}, db=db)
        except HTTPException as exc:
            return exc, reconcile, db
    return response, reconcile, db


class TestUpdateAdviserInactivePrograms:
    """Inactive programs block new assignments, not re-sending held ones."""

    @pytest.mark.asyncio
    async def test_edit_keeps_held_inactive_program(self):
        response, reconcile, db = await _run(
            held_codes=["BSIT"],
            codes=["BSIT", "BSCS"],
            department_flags={"BSIT": False, "BSCS": True},
        )

        assert response.departments == ["BSIT", "BSCS"]
        assert reconcile.await_args.kwargs["department_codes"] == ["BSIT", "BSCS"]
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_new_assignment_to_inactive_program_is_rejected(self):
        error, reconcile, db = await _run(
            held_codes=["BSCS"],
            codes=["BSCS", "BSIT"],
            department_flags={"BSCS": True, "BSIT": False},
        )

        assert isinstance(error, HTTPException)
        assert error.status_code == 400
        assert error.detail == 'Department code "BSIT" is inactive.'
        reconcile.assert_not_awaited()
        db.commit.assert_not_awaited()
