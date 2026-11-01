from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.routers.admin import departments as dept_router
from app.routers.admin.departments import (
    DepartmentCreateRequest,
    DepartmentUpdateRequest,
    create_department,
    update_department,
)


def _db(**overrides):
    db = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock(return_value=overrides.get("get"))
    # Department lookups by code return nothing (no conflict).
    scalar = MagicMock()
    scalar.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=scalar)
    return db


@pytest.mark.asyncio
async def test_create_department_is_recorded_with_new_values():
    db = _db()
    dept_id = uuid4()

    async def fake_flush():
        # The real flush assigns the primary key; mirror that on the object added.
        added = db.add.call_args.args[0]
        added.id = dept_id

    db.flush = AsyncMock(side_effect=fake_flush)

    with (
        patch.object(dept_router, "record_activity", new=AsyncMock()) as recorded,
        patch.object(dept_router, "_serialize_department", return_value={}),
    ):
        await create_department(
            DepartmentCreateRequest(code="BSIT", name="Information Technology"),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    kwargs = recorded.await_args.kwargs
    assert kwargs["action"] == "create"
    assert kwargs["entity_type"] == "department"
    assert kwargs["entity_id"] == dept_id
    assert kwargs["entity_label"] == "BSIT"
    assert kwargs["new_values"]["name"] == "Information Technology"


@pytest.mark.asyncio
async def test_update_department_records_only_changed_fields():
    department = SimpleNamespace(
        id=uuid4(),
        code="BSIT",
        name="Information Technology",
        is_active=True,
    )
    db = _db(get=department)

    with (
        patch.object(dept_router, "record_activity", new=AsyncMock()) as recorded,
        patch.object(dept_router, "_get_department_counts", AsyncMock(return_value=({}, {}))),
        patch.object(dept_router, "_serialize_department", return_value={}),
    ):
        await update_department(
            department.id,
            DepartmentUpdateRequest(is_active=False),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    kwargs = recorded.await_args.kwargs
    assert kwargs["action"] == "update"
    assert kwargs["entity_label"] == "BSIT"
    assert kwargs["previous_values"] == {"is_active": True}
    assert kwargs["new_values"] == {"is_active": False}


@pytest.mark.asyncio
async def test_update_department_with_no_real_change_is_not_recorded():
    department = SimpleNamespace(
        id=uuid4(),
        code="BSIT",
        name="Information Technology",
        is_active=True,
    )
    db = _db(get=department)

    with (
        patch.object(dept_router, "record_activity", new=AsyncMock()) as recorded,
        patch.object(dept_router, "_get_department_counts", AsyncMock(return_value=({}, {}))),
        patch.object(dept_router, "_serialize_department", return_value={}),
    ):
        await update_department(
            department.id,
            DepartmentUpdateRequest(name="Information Technology"),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    recorded.assert_not_awaited()
