"""Tests for the 4A student blank-form route and its service layer.

The route serves ``document_json`` for a requirement item's bound blank form.
Access is gated on the item belonging to the student's school year and the form
still being valid (structured + matching document type). No schema fallback and
no latest-form guessing.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers.students import requirements as student_requirements
from app.services.requirements import get_blank_form_for_item


def _form(doc_type_id, *, creation_mode="structured", name="Admission Form", document_json=None):
    return SimpleNamespace(
        id=uuid4(),
        name=name,
        document_type_id=doc_type_id,
        creation_mode=creation_mode,
        document_json=document_json or {"version": 1, "sections": []},
    )


def _item(doc_type_id, *, form=None, school_year_id=None, item_id=None):
    return SimpleNamespace(
        id=item_id or uuid4(),
        document_type_id=doc_type_id,
        form=form,
        slot=SimpleNamespace(school_year_id=school_year_id),
    )


def _student(school_year_id):
    return SimpleNamespace(school_year_id=school_year_id)


def _db_with_item(item):
    result = MagicMock()
    result.scalar_one_or_none.return_value = item
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ── Service: get_blank_form_for_item ────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_form_when_item_in_student_school_year() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    form = _form(doc_type_id)
    item = _item(doc_type_id, form=form, school_year_id=sy_id)

    got = await get_blank_form_for_item(_db_with_item(item), _student(sy_id), item.id)

    assert got is form


@pytest.mark.asyncio
async def test_returns_none_when_item_in_another_school_year() -> None:
    doc_type_id = uuid4()
    form = _form(doc_type_id)
    item = _item(doc_type_id, form=form, school_year_id=uuid4())

    got = await get_blank_form_for_item(
        _db_with_item(item), _student(uuid4()), item.id,
    )

    assert got is None


@pytest.mark.asyncio
async def test_returns_none_when_item_missing() -> None:
    got = await get_blank_form_for_item(
        _db_with_item(None), _student(uuid4()), uuid4(),
    )

    assert got is None


@pytest.mark.asyncio
async def test_returns_none_when_student_has_no_school_year() -> None:
    got = await get_blank_form_for_item(AsyncMock(), _student(None), uuid4())

    assert got is None


@pytest.mark.asyncio
async def test_returns_none_when_no_form_bound() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, form=None, school_year_id=sy_id)

    got = await get_blank_form_for_item(_db_with_item(item), _student(sy_id), item.id)

    assert got is None


@pytest.mark.asyncio
async def test_returns_none_for_stale_or_non_structured_form() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()

    stale = _form(uuid4())  # document type mismatch
    legacy = _form(doc_type_id, creation_mode="pdf_overlay")

    for form in (stale, legacy):
        item = _item(doc_type_id, form=form, school_year_id=sy_id)
        got = await get_blank_form_for_item(_db_with_item(item), _student(sy_id), item.id)
        assert got is None


# ── Router: GET /api/me/requirement-items/{item_id}/form ─────────────────


@pytest.mark.asyncio
async def test_endpoint_returns_document_json(monkeypatch: pytest.MonkeyPatch) -> None:
    student = SimpleNamespace(id=uuid4(), school_year_id=uuid4())
    form = _form(uuid4(), document_json={"version": 1, "title": "Admission Form", "sections": []})

    async def fake_ensure_user_row(db, current_user):
        return SimpleNamespace(id=uuid4())

    async def fake_get_blank_form_for_item(db, s, item_id):
        return form

    monkeypatch.setattr(student_requirements, "ensure_user_row", fake_ensure_user_row)
    monkeypatch.setattr(student_requirements, "get_blank_form_for_item", fake_get_blank_form_for_item)

    student_result = MagicMock()
    student_result.scalar_one_or_none.return_value = student
    db = AsyncMock()
    db.execute = AsyncMock(return_value=student_result)

    response = await student_requirements.get_blank_form(uuid4(), current_user={}, db=db)

    assert response.form_id == form.id
    assert response.form_name == "Admission Form"
    assert response.document_json == {"version": 1, "title": "Admission Form", "sections": []}


@pytest.mark.asyncio
async def test_endpoint_404_when_no_form_bound(monkeypatch: pytest.MonkeyPatch) -> None:
    student = SimpleNamespace(id=uuid4(), school_year_id=uuid4())

    async def fake_ensure_user_row(db, current_user):
        return SimpleNamespace(id=uuid4())

    async def fake_get_blank_form_for_item(db, s, item_id):
        return None

    monkeypatch.setattr(student_requirements, "ensure_user_row", fake_ensure_user_row)
    monkeypatch.setattr(student_requirements, "get_blank_form_for_item", fake_get_blank_form_for_item)

    student_result = MagicMock()
    student_result.scalar_one_or_none.return_value = student
    db = AsyncMock()
    db.execute = AsyncMock(return_value=student_result)

    with pytest.raises(HTTPException) as exc:
        await student_requirements.get_blank_form(uuid4(), current_user={}, db=db)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_404_when_student_has_no_school_year(monkeypatch: pytest.MonkeyPatch) -> None:
    student = SimpleNamespace(id=uuid4(), school_year_id=None)

    async def fake_ensure_user_row(db, current_user):
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(student_requirements, "ensure_user_row", fake_ensure_user_row)

    student_result = MagicMock()
    student_result.scalar_one_or_none.return_value = student
    db = AsyncMock()
    db.execute = AsyncMock(return_value=student_result)

    with pytest.raises(HTTPException) as exc:
        await student_requirements.get_blank_form(uuid4(), current_user={}, db=db)

    assert exc.value.status_code == 404
