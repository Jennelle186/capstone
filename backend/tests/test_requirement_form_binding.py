"""Tests for the requirement-item -> printable form binding.

The binding is intentionally narrow: a form may only be attached to an item
whose document type matches, and only structured (not legacy PDF-overlay)
forms are exposed to students.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import RequirementSlotItem, SchoolYearStatus
from app.services.requirements import (
    _slot_to_response,
    get_student_slot_statuses,
    replace_requirement_slots,
)

SY_ACTIVE = SimpleNamespace(status=SchoolYearStatus.ACTIVE)


def _scalars_result(*rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(rows)
    return result


def _rows_result(*rows):
    result = MagicMock()
    result.all.return_value = list(rows)
    return result


def _form(doc_type_id, *, creation_mode="structured", name="Admission Form"):
    return SimpleNamespace(
        id=uuid4(),
        name=name,
        document_type_id=doc_type_id,
        creation_mode=creation_mode,
    )


def _doc_type(name="Admission Form", code="ADM"):
    return SimpleNamespace(
        name=name,
        code=code,
        applicable_classifications=[],
    )


def _slot_item(doc_type_id, doc_type, form=None):
    return SimpleNamespace(
        id=uuid4(),
        document_type_id=doc_type_id,
        document_type=doc_type,
        extraction_schema_id=None,
        extraction_schema=None,
        form_id=form.id if form else None,
        form=form,
        is_primary=True,
        display_order=0,
    )


def _slot(*, items):
    return SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        slot_type="solo",
        group_name=None,
        description=None,
        min_required=1,
        display_order=0,
        items=items,
    )


@pytest.mark.asyncio
async def test_replace_slots_persists_matching_form_binding() -> None:
    doc_type_id = uuid4()
    form = _form(doc_type_id)

    db = AsyncMock()
    db.get = AsyncMock(return_value=SY_ACTIVE)
    db.add = MagicMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(doc_type_id),  # document type validation
            _rows_result(form),  # form validation
            MagicMock(),  # delete requirement_slots
            MagicMock(),  # delete school_year_requirements
        ]
    )

    await replace_requirement_slots(
        db,
        uuid4(),
        [
            {
                "slot_type": "solo",
                "items": [
                    {
                        "document_type_id": doc_type_id,
                        "form_id": form.id,
                    }
                ],
            }
        ],
    )

    added_items = [
        call.args[0]
        for call in db.add.call_args_list
        if isinstance(call.args[0], RequirementSlotItem)
    ]
    assert len(added_items) == 1
    assert added_items[0].form_id == form.id
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_replace_slots_rejects_form_with_mismatched_document_type() -> None:
    doc_type_id = uuid4()
    form = _form(uuid4())

    db = AsyncMock()
    db.get = AsyncMock(return_value=SY_ACTIVE)
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(doc_type_id),
            _rows_result(form),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await replace_requirement_slots(
            db,
            uuid4(),
            [
                {
                    "slot_type": "solo",
                    "items": [
                        {
                            "document_type_id": doc_type_id,
                            "form_id": form.id,
                        }
                    ],
                }
            ],
        )

    assert exc.value.status_code == 400
    assert "do not match the document type" in exc.value.detail
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_replace_slots_rejects_legacy_pdf_overlay_form() -> None:
    doc_type_id = uuid4()
    form = _form(doc_type_id, creation_mode="pdf_overlay")

    db = AsyncMock()
    db.get = AsyncMock(return_value=SY_ACTIVE)
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(doc_type_id),
            _rows_result(form),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await replace_requirement_slots(
            db,
            uuid4(),
            [
                {
                    "slot_type": "solo",
                    "items": [
                        {
                            "document_type_id": doc_type_id,
                            "form_id": form.id,
                        }
                    ],
                }
            ],
        )

    assert exc.value.status_code == 400
    assert "not structured" in exc.value.detail
    db.commit.assert_not_awaited()


def test_slot_to_response_includes_only_valid_form_binding() -> None:
    doc_type_id = uuid4()
    valid_form = _form(doc_type_id, name="Freshman Admission Form")
    stale_form = _form(uuid4(), name="Wrong Document Type Form")
    doc_type = _doc_type()

    slot = _slot(
        items=[
            _slot_item(doc_type_id, doc_type, form=valid_form),
            _slot_item(doc_type_id, doc_type, form=stale_form),
        ]
    )

    response = _slot_to_response(slot)

    assert response.items[0].form_id == valid_form.id
    assert response.items[0].form_name == "Freshman Admission Form"
    # A stale binding is hidden rather than offered to admins/students.
    assert response.items[1].form_id is None
    assert response.items[1].form_name is None


@pytest.mark.asyncio
async def test_student_status_exposes_valid_bound_form() -> None:
    doc_type_id = uuid4()
    form = _form(doc_type_id, name="Admission Form")
    item = _slot_item(doc_type_id, _doc_type(), form=form)
    slot = _slot(items=[item])
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        classification=None,
    )

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(slot),  # slot lookup
            _scalars_result(),  # submissions lookup
        ]
    )

    statuses = await get_student_slot_statuses(db, student)

    assert len(statuses) == 1
    assert statuses[0].items[0].form_id == form.id
    assert statuses[0].items[0].form_name == "Admission Form"


@pytest.mark.asyncio
async def test_student_status_hides_stale_bound_form() -> None:
    doc_type_id = uuid4()
    form = _form(uuid4(), name="Wrong Document Type Form")
    item = _slot_item(doc_type_id, _doc_type(), form=form)
    slot = _slot(items=[item])
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        classification=None,
    )

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_result(slot),
            _scalars_result(),
        ]
    )

    statuses = await get_student_slot_statuses(db, student)

    assert statuses[0].items[0].form_id is None
    assert statuses[0].items[0].form_name is None
