from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import Program, ProgramAdviserAssignment
from app.services.adviser_core import reconcile_adviser_program_assignments
from app.services.helpers import program_uuid_for_department_code


@pytest.fixture
def adviser_id():
    return uuid4()


@pytest.fixture
def school_year_id():
    return uuid4()


def _make_assignment(program_id):
    """Build a mock assignment row with the shape reconcile expects."""
    return MagicMock(program_id=program_id)


def _make_execute_result(assignments):
    """Build a mock db.execute() result that returns the given assignments."""
    result = MagicMock()
    result.scalars.return_value = MagicMock(all=MagicMock(return_value=assignments))
    return result


def _make_db(assignments):
    """Build a mock session whose execute/get return deterministic data."""
    db = MagicMock()
    db.execute = AsyncMock(return_value=_make_execute_result(assignments))
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    return db


class TestReconcileAdviserProgramAssignments:
    @pytest.mark.asyncio
    async def test_adds_missing_assignment_and_keeps_existing(self, adviser_id, school_year_id):
        bsit_id = program_uuid_for_department_code("BSIT")
        existing_bsit = _make_assignment(bsit_id)

        db = _make_db([existing_bsit])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, ["bsit", "BSCS"],
        )

        # BSCS should be added; BSIT already existed so only one add happens.
        adds = [call.args[0] for call in db.add.call_args_list]
        assert any(isinstance(a, ProgramAdviserAssignment) for a in adds)
        added = [a for a in adds if isinstance(a, ProgramAdviserAssignment)]
        assert len(added) == 1
        assert added[0].program_id == program_uuid_for_department_code("BSCS")
        assert added[0].adviser_id == adviser_id
        assert added[0].school_year_id == school_year_id
        db.delete.assert_not_called()
        assert result == ["BSIT", "BSCS"]

    @pytest.mark.asyncio
    async def test_preserves_non_alphabetical_input_order(self, adviser_id, school_year_id):
        # Input order is intentionally not alphabetical so this test would fail
        # if reconcile re-sorted the returned codes (e.g. via sorted()).
        db = _make_db([])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, ["BSCS", "bsit"],
        )

        assert result == ["BSCS", "BSIT"]

    @pytest.mark.asyncio
    async def test_deletes_stale_assignment_not_in_desired_set(self, adviser_id, school_year_id):
        bsit_id = program_uuid_for_department_code("BSIT")
        bscs_id = program_uuid_for_department_code("BSCS")
        existing_bsit = _make_assignment(bsit_id)
        existing_bscs = _make_assignment(bscs_id)

        db = _make_db([existing_bsit, existing_bscs])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, ["BSIT"],
        )

        # BSIT stays; BSCS is removed (deleted) and not re-added.
        assert [call.args[0] for call in db.delete.call_args_list] == [existing_bscs]
        adds = [a for a in (call.args[0] for call in db.add.call_args_list) if isinstance(a, ProgramAdviserAssignment)]
        assert adds == []
        assert result == ["BSIT"]

    @pytest.mark.asyncio
    async def test_empty_list_removes_all_assignments(self, adviser_id, school_year_id):
        bsit_id = program_uuid_for_department_code("BSIT")
        existing_bsit = _make_assignment(bsit_id)

        db = _make_db([existing_bsit])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, [],
        )

        assert [call.args[0] for call in db.delete.call_args_list] == [existing_bsit]
        assert result == []

    @pytest.mark.asyncio
    async def test_auto_creates_program_row_for_unknown_code(self, adviser_id, school_year_id):
        bscs_id = program_uuid_for_department_code("BSCS")

        db = _make_db([])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, ["BSCS"],
        )

        adds = list(db.add.call_args_list)
        # A Program row is created first, then the assignment row.
        assert any(isinstance(call.args[0], Program) for call in adds)
        assert any(isinstance(call.args[0], ProgramAdviserAssignment) for call in adds)
        program_add = next(call.args[0] for call in adds if isinstance(call.args[0], Program))
        assert program_add.id == bscs_id
        assert result == ["BSCS"]

    @pytest.mark.asyncio
    async def test_normalizes_case_and_whitespace(self, adviser_id, school_year_id):
        bscs_id = program_uuid_for_department_code("BSCS")

        db = _make_db([])
        result = await reconcile_adviser_program_assignments(
            db, adviser_id, school_year_id, ["  bscs ", "", "  "],
        )

        assert result == ["BSCS"]
        adds = [a for a in (call.args[0] for call in db.add.call_args_list) if isinstance(a, ProgramAdviserAssignment)]
        assert len(adds) == 1
        assert adds[0].program_id == bscs_id
