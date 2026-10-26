"""Tests for yearly rollover (Phase 5): requirements copy by reference."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models import (
    ExtractionSchema,
    Form,
    ProgramAdviserAssignment,
    RequirementSlotItem,
)
from app.services import school_years as sy


def _async_return(value):
    async def _fn(*args, **kwargs):
        return value

    return _fn


def _rows(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


@pytest.mark.asyncio
async def test_rollover_copies_requirements_by_reference(monkeypatch) -> None:
    source_sy = SimpleNamespace(id=uuid4(), name="2025-2026")
    schema_id = uuid4()
    form_id = uuid4()
    item = SimpleNamespace(
        id=uuid4(),
        document_type_id=None,
        extraction_schema_id=schema_id,
        form_id=form_id,
        is_primary=True,
        display_order=0,
    )
    slot = SimpleNamespace(
        id=uuid4(),
        slot_type="solo",
        group_name=None,
        description=None,
        min_required=1,
        display_order=0,
        snapshot_fields_json=None,
        items=[item],
    )

    monkeypatch.setattr(sy, "get_school_year_or_404", _async_return(source_sy))
    monkeypatch.setattr(sy, "validate_date_range", lambda *a, **k: None)
    monkeypatch.setattr(sy, "ensure_unique_name", _async_return(None))
    monkeypatch.setattr(sy, "log_school_year_action", _async_return(None))
    monkeypatch.setattr(sy, "serialize_school_year", _async_return({"id": "new-year"}))

    added_objects: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock(return_value=_rows([slot]))

    payload = SimpleNamespace(
        name="2026-2027",
        start_date=date(2026, 6, 1),
        end_date=date(2027, 5, 31),
        auto_closure_date=None,
        copy_assignments=False,
        copy_requirements=True,
        set_as_active=False,
    )

    await sy.rollover_school_year(db, source_sy.id, payload, {})

    items = [a for a in added_objects if isinstance(a, RequirementSlotItem)]
    assert len(items) == 1
    # The new item reuses the SAME form and schema (by reference), not clones.
    assert items[0].extraction_schema_id == schema_id
    assert items[0].form_id == form_id

    # No forms or schemas were duplicated.
    assert not any(isinstance(a, (ExtractionSchema, Form)) for a in added_objects)


@pytest.mark.asyncio
async def test_rollover_copy_requirements_false_creates_no_items(monkeypatch) -> None:
    source_sy = SimpleNamespace(id=uuid4(), name="2025-2026")

    monkeypatch.setattr(sy, "get_school_year_or_404", _async_return(source_sy))
    monkeypatch.setattr(sy, "validate_date_range", lambda *a, **k: None)
    monkeypatch.setattr(sy, "ensure_unique_name", _async_return(None))
    monkeypatch.setattr(sy, "log_school_year_action", _async_return(None))
    monkeypatch.setattr(sy, "serialize_school_year", _async_return({"id": "new-year"}))

    added_objects: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    payload = SimpleNamespace(
        name="2026-2027",
        start_date=date(2026, 6, 1),
        end_date=date(2027, 5, 31),
        auto_closure_date=None,
        copy_assignments=False,
        copy_requirements=False,
        set_as_active=False,
    )

    await sy.rollover_school_year(db, source_sy.id, payload, {})

    assert not any(isinstance(a, RequirementSlotItem) for a in added_objects)
    assert not any(isinstance(a, (ExtractionSchema, Form)) for a in added_objects)


@pytest.mark.asyncio
async def test_rollover_copies_adviser_assignments(monkeypatch) -> None:
    source_sy = SimpleNamespace(id=uuid4(), name="2025-2026")
    assignment = SimpleNamespace(adviser_id=uuid4(), program_id=uuid4())

    monkeypatch.setattr(sy, "get_school_year_or_404", _async_return(source_sy))
    monkeypatch.setattr(sy, "validate_date_range", lambda *a, **k: None)
    monkeypatch.setattr(sy, "ensure_unique_name", _async_return(None))
    monkeypatch.setattr(sy, "_latest_assignment_rows", _async_return([(assignment, None, None)]))
    monkeypatch.setattr(sy, "log_school_year_action", _async_return(None))
    monkeypatch.setattr(sy, "serialize_school_year", _async_return({"id": "new-year"}))

    added_objects: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    payload = SimpleNamespace(
        name="2026-2027",
        start_date=date(2026, 6, 1),
        end_date=date(2027, 5, 31),
        auto_closure_date=None,
        copy_assignments=True,
        copy_requirements=False,
        set_as_active=False,
    )

    await sy.rollover_school_year(db, source_sy.id, payload, {})

    assignments = [a for a in added_objects if isinstance(a, ProgramAdviserAssignment)]
    assert len(assignments) == 1
    assert assignments[0].adviser_id == assignment.adviser_id
    assert assignments[0].program_id == assignment.program_id


@pytest.mark.asyncio
async def test_rollover_group_slot_multiple_items_by_reference(monkeypatch) -> None:
    source_sy = SimpleNamespace(id=uuid4(), name="2025-2026")
    schema_id = uuid4()
    form_id = uuid4()
    item1 = SimpleNamespace(
        id=uuid4(), document_type_id=uuid4(), extraction_schema_id=schema_id,
        form_id=form_id, is_primary=True, display_order=0,
    )
    item2 = SimpleNamespace(
        id=uuid4(), document_type_id=uuid4(), extraction_schema_id=None,
        form_id=None, is_primary=False, display_order=1,
    )
    slot = SimpleNamespace(
        id=uuid4(), slot_type="group", group_name="Proof", description=None,
        min_required=1, display_order=0, snapshot_fields_json=None,
        items=[item1, item2],
    )

    monkeypatch.setattr(sy, "get_school_year_or_404", _async_return(source_sy))
    monkeypatch.setattr(sy, "validate_date_range", lambda *a, **k: None)
    monkeypatch.setattr(sy, "ensure_unique_name", _async_return(None))
    monkeypatch.setattr(sy, "log_school_year_action", _async_return(None))
    monkeypatch.setattr(sy, "serialize_school_year", _async_return({"id": "new-year"}))

    added_objects: list = []
    db = AsyncMock()
    db.add = MagicMock(side_effect=lambda obj: added_objects.append(obj))
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock(return_value=_rows([slot]))

    payload = SimpleNamespace(
        name="2026-2027", start_date=date(2026, 6, 1), end_date=date(2027, 5, 31),
        auto_closure_date=None, copy_assignments=False, copy_requirements=True,
        set_as_active=False,
    )

    await sy.rollover_school_year(db, source_sy.id, payload, {})

    items = [a for a in added_objects if isinstance(a, RequirementSlotItem)]
    assert len(items) == 2
    # Both items are copied by reference (same ids / None), not cloned.
    assert items[0].extraction_schema_id == schema_id
    assert items[0].form_id == form_id
    assert items[1].extraction_schema_id is None
    assert items[1].form_id is None
    assert not any(isinstance(a, (ExtractionSchema, Form)) for a in added_objects)
