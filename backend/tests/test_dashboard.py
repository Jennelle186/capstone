from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4, uuid5

import pytest

from app.services.admin_analytics.dashboard import get_dashboard_kpi
from app.schemas.requirements import SlotItemStatus, SlotStatusResponse

PROGRAM_UUID_NAMESPACE = UUID("e40ec4af-aa57-47e2-9169-cc4f1f6d03ff")


def _make_slot_status(*, is_complete: bool, matched_count: int = 0, min_required: int = 1) -> SlotStatusResponse:
    return SlotStatusResponse(
        id=str(uuid4()),
        slot_type="solo",
        group_name=None,
        description=None,
        min_required=min_required,
        display_order=0,
        items=[SlotItemStatus(document_type_id=str(uuid4()), document_type_name="Test", document_type_code="TD", is_primary=True)],
        is_complete=is_complete,
        matched_submission_ids=[],
        matched_count=matched_count,
    )


class _MockRow:
    def __init__(self, *pos_args, **attrs):
        self._pos = list(pos_args)
        for k, v in attrs.items():
            setattr(self, k, v)

    def __getitem__(self, idx):
        return self._pos[idx]


def _make_mock_row(*pos_args, **attrs):
    return _MockRow(*pos_args, **attrs)


def _mock_result(*, scalar=None, all_rows=None, scalars_all=None):
    m = MagicMock()
    m.scalar.return_value = scalar
    m.all.return_value = all_rows or []
    s = MagicMock()
    s.all.return_value = scalars_all or []
    m.scalars.return_value = s
    return m


class TestGetDashboardKPI:
    """Tests for get_dashboard_kpi — the admin dashboard KPI endpoint logic."""

    pytestmark = pytest.mark.asyncio

    SY_ID = uuid4()
    DEPT_ID_1 = uuid4()
    DEPT_ID_2 = uuid4()

    @pytest.fixture(autouse=True)
    def _patch_deps(self):
        patchers = [
            patch(
                "app.services.admin_analytics.dashboard.get_active_school_year_id",
                return_value=self.SY_ID,
            ),
            patch(
                "app.services.admin_analytics.dashboard.exclude_replaced_submissions",
                side_effect=lambda q: q,
            ),
            patch(
                "app.services.admin_analytics.dashboard.get_bulk_student_slot_statuses",
                return_value={},
            ),
        ]
        for p in patchers:
            p.start()
        yield
        for p in patchers:
            p.stop()

    def _make_student(self, student_id, dept_id, classification="freshman"):
        s = MagicMock()
        s.id = student_id
        s.program_id = dept_id
        c = MagicMock()
        c.value = classification
        s.classification = c
        return s

    async def test_no_active_school_year(self):
        with patch(
            "app.services.admin_analytics.dashboard.get_active_school_year_id",
            return_value=None,
        ):
            result = await get_dashboard_kpi(AsyncMock())
        assert result["school_year"] == ""
        assert result["total_submissions"] == 0
        assert result["department_clearance"] == []

    async def test_no_students_returns_empty_clearance(self):
        now = datetime.now(timezone.utc)
        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=_make_mock_row(name="SY 2025-2026"))
        mock_db.execute.side_effect = [
            # 1. dept_stmt
            _mock_result(all_rows=[
                _make_mock_row(id=self.DEPT_ID_1, code="CASE", name="Computer Engineering"),
            ]),
            # 2. adviser_stmt
            _mock_result(all_rows=[]),
            # 3. total_sub_stmt
            _mock_result(scalar=10),
            # 4. weekly_stmt
            _mock_result(scalar=2),
            # 5. pending_stmt
            _mock_result(scalar=3),
            # 6. pending_before_stmt
            _mock_result(scalar=1),
            # 7. students_stmt
            _mock_result(scalars_all=[]),
        ]

        result = await get_dashboard_kpi(mock_db)
        assert result["school_year"] == "SY 2025-2026"
        assert result["total_submissions"] == 10
        assert result["weekly_new_submissions"] == 2
        assert result["pending_queue"] == 3
        assert result["pending_queue_weekly_delta"] == 2
        assert result["department_clearance"] == []

    async def test_clearance_and_adviser_info(self):
        student_1 = self._make_student(uuid4(), self.DEPT_ID_1, "freshman")
        student_2 = self._make_student(uuid4(), self.DEPT_ID_1, "freshman")
        student_3 = self._make_student(uuid4(), self.DEPT_ID_2, "senior")

        statuses_map = {
            student_1.id: [_make_slot_status(is_complete=True) for _ in range(3)],
            student_2.id: [
                _make_slot_status(is_complete=True),
                _make_slot_status(is_complete=False),
                _make_slot_status(is_complete=False),
            ],
            student_3.id: [_make_slot_status(is_complete=True) for _ in range(4)],
        }

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=_make_mock_row(name="SY 2025-2026"))
        mock_db.execute.side_effect = [
            # 1. dept_stmt
            _mock_result(all_rows=[
                _make_mock_row(id=self.DEPT_ID_1, code="CASE", name="Computer Engineering"),
                _make_mock_row(id=self.DEPT_ID_2, code="IT", name="Information Technology"),
            ]),
            # 2. adviser_stmt
            _mock_result(all_rows=[
                (uuid5(PROGRAM_UUID_NAMESPACE, "CASE"), "Alice", "Smith"),
                (uuid5(PROGRAM_UUID_NAMESPACE, "CASE"), None, None),
                (uuid5(PROGRAM_UUID_NAMESPACE, "IT"), "Bob", "Jones"),
            ]),
            # 3. total_sub_stmt
            _mock_result(scalar=50),
            # 4. weekly_stmt
            _mock_result(scalar=5),
            # 5. pending_stmt
            _mock_result(scalar=10),
            # 6. pending_before_stmt
            _mock_result(scalar=15),
            # 7. students_stmt
            _mock_result(scalars_all=[student_1, student_2, student_3]),
            # 8. verified_count_stmt
            _mock_result(all_rows=[
                _make_mock_row("_", 3, student_id=student_1.id),
                _make_mock_row("_", 1, student_id=student_2.id),
                _make_mock_row("_", 4, student_id=student_3.id),
            ]),
        ]

        with patch(
            "app.services.admin_analytics.dashboard.get_bulk_student_slot_statuses",
            return_value=statuses_map,
        ):
            result = await get_dashboard_kpi(mock_db)

        assert result["school_year"] == "SY 2025-2026"
        assert result["total_submissions"] == 50
        assert result["weekly_new_submissions"] == 5
        assert result["pending_queue"] == 10
        assert result["pending_queue_weekly_delta"] == -5

        clearance = {d["department_name"]: d for d in result["department_clearance"]}
        assert set(clearance.keys()) == {"Computer Engineering", "Information Technology"}

        # Computer Engineering: 2 students, student_1 all slots complete (cleared),
        # student_2 not all complete (not cleared)
        dept1 = clearance["Computer Engineering"]
        assert dept1["total_students"] == 2
        assert dept1["cleared_students"] == 1
        assert dept1["clearance_rate"] == 50
        assert dept1["adviser_count"] == 1
        assert dept1["adviser_names"] == ["Alice Smith"]

        # Information Technology: 1 student, all slots complete (cleared)
        dept2 = clearance["Information Technology"]
        assert dept2["total_students"] == 1
        assert dept2["cleared_students"] == 1
        assert dept2["clearance_rate"] == 100
        assert dept2["adviser_count"] == 1
        assert dept2["adviser_names"] == ["Bob Jones"]

        # Sorted by rate ascending: CASE (50%) before IT (100%)
        names = [d["department_name"] for d in result["department_clearance"]]
        assert names == ["Computer Engineering", "Information Technology"]

    async def test_student_missing_classification_uses_default_count(self):
        student = self._make_student(uuid4(), self.DEPT_ID_1, None)
        student.classification = None

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=_make_mock_row(name="SY 2025"))
        mock_db.execute.side_effect = [
            _mock_result(all_rows=[
                _make_mock_row(id=self.DEPT_ID_1, code="CASE", name="CE"),
            ]),
            _mock_result(all_rows=[]),
            _mock_result(scalar=5),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalars_all=[student]),
            _mock_result(all_rows=[]),
        ]

        result = await get_dashboard_kpi(mock_db)
        dept = result["department_clearance"][0]
        # With empty slots, student is NOT cleared
        assert dept["total_students"] == 1
        assert dept["cleared_students"] == 0
        assert dept["clearance_rate"] == 0

    async def test_student_without_program_skipped(self):
        student = self._make_student(uuid4(), None, "freshman")
        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=_make_mock_row(name="SY"))
        mock_db.execute.side_effect = [
            _mock_result(all_rows=[]),
            _mock_result(all_rows=[]),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalars_all=[student]),
            _mock_result(all_rows=[]),
        ]
        result = await get_dashboard_kpi(mock_db)
        assert result["department_clearance"] == []

    async def test_clearance_with_zero_students_per_department(self):
        """A department with no students in the active school year is absent."""
        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=_make_mock_row(name="SY"))
        mock_db.execute.side_effect = [
            _mock_result(all_rows=[
                _make_mock_row(id=self.DEPT_ID_1, code="CASE", name="CE"),
            ]),
            _mock_result(all_rows=[]),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalars_all=[]),
        ]
        result = await get_dashboard_kpi(mock_db)
        assert result["department_clearance"] == []

    async def test_school_year_not_found(self):
        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.execute.side_effect = [
            _mock_result(all_rows=[]),
            _mock_result(all_rows=[]),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalar=0),
            _mock_result(scalars_all=[]),
        ]
        result = await get_dashboard_kpi(mock_db)
        assert result["school_year"] == ""
