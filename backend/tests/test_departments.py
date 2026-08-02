from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.routers.admin.departments import _get_department_counts


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
