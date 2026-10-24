"""Tests for the Phase 4B online form fill service and routes."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import (
    DocumentSubmission,
    FormSubmission,
    FormSubmissionStatus,
    SubmissionStatus,
)
from app.routers.students import form_submissions as form_submissions_router
from app.services.form_submissions import (
    _is_blank,
    _missing_required_keys,
    get_existing_submission,
    get_fillable_item,
    save_draft,
    submit_form,
)

REQUIRED_DOC = {
    "version": 1,
    "sections": [
        {
            "id": "s1",
            "heading": "Student",
            "fields": [],
            "blocks": [
                {"type": "field", "id": "b1", "field_key": "full_name", "label": "Full Name", "required": True},
                {"type": "field", "id": "b2", "field_key": "lrn", "label": "LRN", "required": False},
            ],
        }
    ],
}


def _form(doc_type_id, *, name="Admission Form", document_json=None, creation_mode="structured"):
    return SimpleNamespace(
        id=uuid4(),
        name=name,
        document_type_id=doc_type_id,
        creation_mode=creation_mode,
        document_json=document_json or {"version": 1, "sections": []},
    )


def _item(doc_type_id, form, school_year_id, item_id=None):
    return SimpleNamespace(
        id=item_id or uuid4(),
        document_type_id=doc_type_id,
        form=form,
        slot=SimpleNamespace(school_year_id=school_year_id),
    )


def _student(school_year_id=None):
    return SimpleNamespace(id=uuid4(), school_year_id=school_year_id)


def _db_with_item(item):
    result = MagicMock()
    result.scalar_one_or_none.return_value = item
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ── Pure helpers ─────────────────────────────────────────────────────────


def test_is_blank() -> None:
    assert _is_blank(None)
    assert _is_blank("")
    assert _is_blank("   ")
    assert _is_blank([])
    assert not _is_blank("Jane")
    assert not _is_blank(["a"])


def test_missing_required_keys() -> None:
    assert _missing_required_keys(REQUIRED_DOC, {}) == ["full_name"]
    assert _missing_required_keys(REQUIRED_DOC, {"full_name": " "}) == ["full_name"]
    assert _missing_required_keys(REQUIRED_DOC, {"full_name": "Jane"}) == []


# ── get_fillable_item ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fillable_item_returns_item_when_valid() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id), sy_id)

    got = await get_fillable_item(_db_with_item(item), _student(sy_id), item.id)

    assert got is item


@pytest.mark.asyncio
async def test_fillable_item_none_for_other_year() -> None:
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id), uuid4())

    got = await get_fillable_item(_db_with_item(item), _student(uuid4()), item.id)

    assert got is None


@pytest.mark.asyncio
async def test_fillable_item_none_for_stale_form() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(uuid4()), sy_id)  # form doc type mismatch

    got = await get_fillable_item(_db_with_item(item), _student(sy_id), item.id)

    assert got is None


# ── save_draft ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_save_draft_creates_new_draft() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id), sy_id)
    student = _student(sy_id)

    item_result = MagicMock()
    item_result.scalar_one_or_none.return_value = item
    draft_result = MagicMock()
    draft_result.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[item_result, draft_result])
    db.add = MagicMock()

    draft = await save_draft(db, student, item.id, {"full_name": "Jane"})

    added = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], FormSubmission)]
    assert len(added) == 1
    assert added[0].status == FormSubmissionStatus.DRAFT
    assert added[0].values == {"full_name": "Jane"}
    assert added[0].form_id == item.form.id
    assert draft is added[0]


@pytest.mark.asyncio
async def test_save_draft_updates_existing_draft() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id), sy_id)
    student = _student(sy_id)
    existing = SimpleNamespace(status=FormSubmissionStatus.DRAFT, values={})

    item_result = MagicMock()
    item_result.scalar_one_or_none.return_value = item
    draft_result = MagicMock()
    draft_result.scalar_one_or_none.return_value = existing
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[item_result, draft_result])
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    draft = await save_draft(db, student, item.id, {"full_name": "Jane"})

    assert draft is existing
    assert existing.values == {"full_name": "Jane"}
    assert db.add.call_count == 0


# ── submit_form ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_rejects_missing_required() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id, document_json=REQUIRED_DOC), sy_id)
    db = _db_with_item(item)

    with pytest.raises(HTTPException) as exc:
        await submit_form(db, _student(sy_id), item.id, {"lrn": "123"})

    assert exc.value.status_code == 422
    assert "full_name" in exc.value.detail


@pytest.mark.asyncio
async def test_submit_promotes_existing_draft() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id, document_json=REQUIRED_DOC), sy_id)
    student = _student(sy_id)
    draft = SimpleNamespace(status=FormSubmissionStatus.DRAFT, values={}, document_submission_id=None)

    item_result = MagicMock()
    item_result.scalar_one_or_none.return_value = item
    draft_result = MagicMock()
    draft_result.scalar_one_or_none.return_value = draft
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[item_result, draft_result])
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()

    result = await submit_form(db, student, item.id, {"full_name": "Jane"})

    assert result is draft
    assert draft.status == FormSubmissionStatus.SUBMITTED
    assert draft.values == {"full_name": "Jane"}

    doc_subs = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], DocumentSubmission)]
    assert len(doc_subs) == 1
    assert doc_subs[0].filled_online is True
    assert doc_subs[0].extracted_data == {"full_name": "Jane"}
    assert doc_subs[0].status == SubmissionStatus.SUBMITTED
    assert doc_subs[0].file_key == ""


@pytest.mark.asyncio
async def test_submit_creates_submitted_row_when_no_draft() -> None:
    sy_id = uuid4()
    doc_type_id = uuid4()
    item = _item(doc_type_id, _form(doc_type_id, document_json=REQUIRED_DOC), sy_id)
    student = _student(sy_id)

    item_result = MagicMock()
    item_result.scalar_one_or_none.return_value = item
    draft_result = MagicMock()
    draft_result.scalar_one_or_none.return_value = None
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[item_result, draft_result])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    result = await submit_form(db, student, item.id, {"full_name": "Jane"})

    form_subs = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], FormSubmission)]
    doc_subs = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], DocumentSubmission)]
    assert len(form_subs) == 1
    assert len(doc_subs) == 1
    assert form_subs[0].status == FormSubmissionStatus.SUBMITTED
    assert doc_subs[0].filled_online is True
    assert result is form_subs[0]


# ── get_existing_submission ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_existing_submission_prefers_draft_over_submitted() -> None:
    submitted = SimpleNamespace(status=FormSubmissionStatus.SUBMITTED)
    draft = SimpleNamespace(status=FormSubmissionStatus.DRAFT)
    result = MagicMock()
    result.scalars.return_value.all.return_value = [submitted, draft]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    got = await get_existing_submission(db, uuid4(), uuid4(), uuid4())

    assert got is draft


# ── Router ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_fill_returns_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    doc_type_id = uuid4()
    form = _form(doc_type_id, document_json=REQUIRED_DOC)
    student = _student(uuid4())

    async def fake_ensure_user_row(db, current_user):
        return SimpleNamespace(id=uuid4())

    async def fake_get_fill_payload(db, s, item_id):
        return form, None

    monkeypatch.setattr(form_submissions_router, "ensure_user_row", fake_ensure_user_row)
    monkeypatch.setattr(form_submissions_router, "get_fill_payload", fake_get_fill_payload)

    student_result = MagicMock()
    student_result.scalar_one_or_none.return_value = student
    db = AsyncMock()
    db.execute = AsyncMock(return_value=student_result)

    response = await form_submissions_router.get_fill(uuid4(), current_user={}, db=db)

    assert response.form_name == "Admission Form"
    assert response.document_json == REQUIRED_DOC
    assert response.submission is None


@pytest.mark.asyncio
async def test_get_filled_form_returns_layout_and_values(monkeypatch: pytest.MonkeyPatch) -> None:
    student = _student(uuid4())
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student.id,
        filled_online=True,
        extracted_data={"full_name": "Jane"},
    )
    fs = SimpleNamespace(form_id=uuid4())
    form = SimpleNamespace(id=fs.form_id, name="CET Form", document_json={"version": 1, "sections": []})

    async def fake_resolve_student(db, current_user):
        return student

    monkeypatch.setattr(form_submissions_router, "_resolve_student", fake_resolve_student)

    db = AsyncMock()
    db.get = AsyncMock(side_effect=[submission, form])
    fs_result = MagicMock()
    fs_result.scalar_one_or_none.return_value = fs
    db.execute = AsyncMock(return_value=fs_result)

    response = await form_submissions_router.get_filled_form(submission.id, current_user={}, db=db)

    assert response.form_name == "CET Form"
    assert response.document_json == {"version": 1, "sections": []}
    assert response.values == {"full_name": "Jane"}


@pytest.mark.asyncio
async def test_get_filled_form_404_when_not_filled_online(monkeypatch: pytest.MonkeyPatch) -> None:
    student = _student(uuid4())
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student.id,
        filled_online=False,
        extracted_data={},
    )

    async def fake_resolve_student(db, current_user):
        return student

    monkeypatch.setattr(form_submissions_router, "_resolve_student", fake_resolve_student)

    db = AsyncMock()
    db.get = AsyncMock(return_value=submission)

    with pytest.raises(HTTPException) as exc:
        await form_submissions_router.get_filled_form(submission.id, current_user={}, db=db)

    assert exc.value.status_code == 404
