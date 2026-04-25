from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models import SchoolYearStatus
from app.services.school_years import school_year_snapshot, validate_date_range


def test_validate_date_range_rejects_inverted_range() -> None:
    with pytest.raises(HTTPException) as exc:
        validate_date_range(date(2026, 6, 1), date(2026, 5, 31))

    assert exc.value.status_code == 400
    assert "End date" in exc.value.detail


def test_validate_date_range_rejects_auto_closure_before_start() -> None:
    with pytest.raises(HTTPException) as exc:
        validate_date_range(date(2026, 6, 1), date(2027, 5, 31), date(2026, 5, 31))

    assert exc.value.status_code == 400
    assert "Auto closure" in exc.value.detail


def test_validate_date_range_accepts_auto_closure_after_end_date() -> None:
    validate_date_range(date(2026, 6, 1), date(2027, 5, 31), date(2030, 5, 31))


def test_school_year_snapshot_serializes_values() -> None:
    school_year = SimpleNamespace(
        id="school-year-id",
        name="2026-2027",
        start_date=date(2026, 6, 1),
        end_date=date(2027, 5, 31),
        auto_closure_date=None,
        status=SchoolYearStatus.UPCOMING,
        is_active=False,
    )

    assert school_year_snapshot(school_year) == {
        "id": "school-year-id",
        "name": "2026-2027",
        "start_date": "2026-06-01",
        "end_date": "2027-05-31",
        "auto_closure_date": None,
        "status": "upcoming",
        "is_active": False,
    }
