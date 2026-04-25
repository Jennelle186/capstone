from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import SchoolYearStatus
from app.services.document_requirements import (
    ensure_school_year_requirements_mutable,
    get_school_year_or_404,
)


@pytest.mark.asyncio
async def test_get_school_year_or_404_raises_when_missing() -> None:
    db = AsyncMock()
    db.get.return_value = None

    with pytest.raises(HTTPException) as exc:
        await get_school_year_or_404(db, uuid4())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_ensure_school_year_requirements_mutable_raises_for_closed_year() -> None:
    db = AsyncMock()
    db.get.return_value = SimpleNamespace(status=SchoolYearStatus.CLOSED)

    with pytest.raises(HTTPException) as exc:
        await ensure_school_year_requirements_mutable(db, uuid4())

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_ensure_school_year_requirements_mutable_allows_non_closed_year() -> None:
    school_year = SimpleNamespace(status=SchoolYearStatus.UPCOMING)
    db = AsyncMock()
    db.get.return_value = school_year

    result = await ensure_school_year_requirements_mutable(db, uuid4())

    assert result is school_year
