from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import SchoolYearStatus, UserRole
from app.routers.admin.departments import (
    AdviserDepartmentUpdateRequest,
    _get_department_counts,
    update_adviser_department,
)
from app.services.helpers import program_uuid_for_department_code


class TestGetDepartmentCounts:
    """Verify student_count is properly scoped to school_year_id."""

    @pytest.mark.asyncio
    async def test_student_count_filtered_by_school_year(self):
        school_year_id = uuid4()
        mock_db_session = MagicMock()
        result = MagicMock()
        result.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=result)

        with patch(
            "app.routers.admin.departments.get_department_adviser_counts_for_school_year",
            return_value={},
        ):
            await _get_department_counts(mock_db_session, school_year_id)

        stmt = mock_db_session.execute.call_args[0][0]
        compiled = str(stmt.compile())
        assert "school_year_id" in compiled

    @pytest.mark.asyncio
    async def test_returns_correct_student_count_for_school_year(self):
        school_year_id = uuid4()
        mock_db_session = MagicMock()
        result = MagicMock()
        mock_student_row = MagicMock()
        mock_student_row.code = "BSIT"
        mock_student_row.student_count = 42
        result.all.return_value = [mock_student_row]
        mock_db_session.execute = AsyncMock(return_value=result)

        with patch(
            "app.routers.admin.departments.get_department_adviser_counts_for_school_year",
            return_value={"bsit": 3},
        ):
            adviser_counts, student_counts = await _get_department_counts(
                mock_db_session, school_year_id,
            )

        assert student_counts == {"bsit": 42}
        assert adviser_counts == {"bsit": 3}

    @pytest.mark.asyncio
    async def test_student_count_returns_empty_for_unknown_school_year(self):
        school_year_id = uuid4()
        mock_db_session = MagicMock()
        result = MagicMock()
        result.all.return_value = []
        mock_db_session.execute = AsyncMock(return_value=result)

        with patch(
            "app.routers.admin.departments.get_department_adviser_counts_for_school_year",
            return_value={},
        ):
            adviser_counts, student_counts = await _get_department_counts(
                mock_db_session, school_year_id,
            )

        assert student_counts == {}


class TestUpdateAdviserDepartmentInactivePrograms:
    """Inactive programs block new assignments, not edits to existing ones."""

    @staticmethod
    def _make_db(held_codes):
        adviser = MagicMock(id=uuid4(), created_at=datetime.now(timezone.utc))
        user = MagicMock(
            first_name="Ada",
            middle_name=None,
            last_name="Lovelace",
            email="ada@example.com",
            role=UserRole.ADVISER,
        )
        adviser_row = MagicMock()
        adviser_row.first.return_value = (adviser, user)
        held_rows = MagicMock()
        held_rows.scalars.return_value = MagicMock(
            all=MagicMock(
                return_value=[program_uuid_for_department_code(c) for c in held_codes],
            ),
        )

        db = MagicMock()
        db.execute = AsyncMock(side_effect=[adviser_row, held_rows])
        db.get = AsyncMock(
            return_value=MagicMock(id=uuid4(), status=SchoolYearStatus.ACTIVE),
        )
        db.commit = AsyncMock()
        return db

    @staticmethod
    async def _update(db, codes, departments):
        """Run the endpoint; ``departments`` maps code -> is_active."""

        async def get_department(_db, code):
            if code not in departments:
                return None
            return MagicMock(is_active=departments[code])

        reconcile = AsyncMock(return_value=codes)
        with (
            patch(
                "app.routers.admin.departments._get_department_by_code",
                side_effect=get_department,
            ),
            patch(
                "app.routers.admin.departments.reconcile_adviser_program_assignments",
                reconcile,
            ),
        ):
            try:
                response = await update_adviser_department(
                    uuid4(),
                    AdviserDepartmentUpdateRequest(
                        department_codes=codes,
                        school_year_id=uuid4(),
                    ),
                    current_user={},
                    db=db,
                )
            except HTTPException as exc:
                return exc, reconcile
        return response, reconcile

    @pytest.mark.asyncio
    async def test_removing_active_program_keeps_held_inactive_program(self):
        db = self._make_db(["BSCS", "BSIT"])

        response, reconcile = await self._update(
            db, ["BSIT"], {"BSCS": True, "BSIT": False},
        )

        assert response.departments == ["BSIT"]
        assert reconcile.await_args.kwargs["department_codes"] == ["BSIT"]
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_removing_one_of_two_held_inactive_programs(self):
        db = self._make_db(["ACT", "BSIT"])

        response, _ = await self._update(
            db, ["ACT"], {"ACT": False, "BSIT": False},
        )

        assert response.departments == ["ACT"]
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_removing_every_held_program_still_works(self):
        db = self._make_db(["BSIT"])

        response, reconcile = await self._update(db, [], {"BSIT": False})

        assert response.departments == []
        assert reconcile.await_args.kwargs["department_codes"] == []
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_new_assignment_to_inactive_program_is_rejected(self):
        db = self._make_db(["BSCS"])

        error, reconcile = await self._update(
            db, ["BSCS", "BSIT"], {"BSCS": True, "BSIT": False},
        )

        assert isinstance(error, HTTPException)
        assert error.status_code == 400
        assert error.detail == 'Department code "BSIT" is inactive.'
        reconcile.assert_not_awaited()
        db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_program_is_rejected(self):
        db = self._make_db(["BSCS"])

        error, reconcile = await self._update(db, ["NOPE"], {"BSCS": True})

        assert isinstance(error, HTTPException)
        assert error.status_code == 404
        reconcile.assert_not_awaited()
        db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_held_programs_are_scoped_to_adviser_and_school_year(self):
        db = self._make_db(["BSIT"])

        await self._update(db, ["BSIT"], {"BSIT": False})

        held_stmt = db.execute.await_args_list[1].args[0]
        compiled = str(held_stmt.compile())
        assert "program_adviser_assignments.adviser_id" in compiled
        assert "program_adviser_assignments.school_year_id" in compiled
