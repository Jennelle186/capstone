from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus, StudentClassification
from app.services.requirements import (
    _filter_slots_by_classification,
    get_student_slot_statuses,
)


# ── Test helpers ──────────────────────────────────────────────────────────


def _doc_type(name, code, applicable=None):
    return SimpleNamespace(
        name=name, code=code, applicable_classifications=applicable or []
    )


def _slot_item(doc_type_id, doc_type, is_primary=False):
    return SimpleNamespace(
        id=uuid4(),
        document_type_id=doc_type_id,
        is_primary=is_primary,
        document_type=doc_type,
    )


def _slot(
    id=None,
    slot_type="solo",
    min_required=1,
    display_order=0,
    items=None,
    group_name=None,
    description=None,
):
    return SimpleNamespace(
        id=id or uuid4(),
        slot_type=slot_type,
        group_name=group_name,
        description=description,
        min_required=min_required,
        display_order=display_order,
        items=items or [],
    )


def _submission(id=None, doc_type_id=None, status=SubmissionStatus.VERIFIED):
    return SimpleNamespace(
        id=id or uuid4(),
        student_id=uuid4(),
        document_type_id=doc_type_id,
        status=status,
    )


def _student(id=None, school_year_id=None, classification=None):
    return SimpleNamespace(
        id=id or uuid4(),
        school_year_id=school_year_id or uuid4(),
        classification=classification,
    )


def _submissions_result(*subs):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(subs)
    return result


# ── Bug 5F: duplicate solo slots ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_solo_slot_caps_matched_count() -> None:
    """Solo slot caps matched_count at min_required even with duplicate submissions."""
    doc_type_id = uuid4()
    dt = _doc_type("Birth Certificate", "birth_cert")
    item = _slot_item(doc_type_id, dt)
    slot = _slot(min_required=1, items=[item])
    student = _student(classification=StudentClassification.FRESHMAN)

    sub1 = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED)
    sub2 = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub1, sub2)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].matched_count == 1
    assert result[0].is_complete is True


@pytest.mark.asyncio
async def test_solo_slot_exposes_duplicate_submission_ids() -> None:
    """Solo slot exposes all duplicate submission IDs in matched_submission_ids."""
    doc_type_id = uuid4()
    dt = _doc_type("Birth Certificate", "birth_cert")
    item = _slot_item(doc_type_id, dt)
    slot = _slot(min_required=1, items=[item])
    student = _student(classification=StudentClassification.FRESHMAN)

    sub1 = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED)
    sub2 = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub1, sub2)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].matched_count == 1
    assert len(result[0].matched_submission_ids) == 2
    assert sub1.id in result[0].matched_submission_ids
    assert sub2.id in result[0].matched_submission_ids
    # duplicate_submission_ids should contain only the extras beyond min_required
    assert len(result[0].duplicate_submission_ids) == 1
    assert sub2.id in result[0].duplicate_submission_ids


@pytest.mark.asyncio
async def test_group_slot_has_no_duplicate_submission_ids() -> None:
    """Group slots never expose duplicate_submission_ids (multiple matches are intentional)."""
    dt_id_a = uuid4()
    dt_id_b = uuid4()
    items = [
        _slot_item(dt_id_a, _doc_type("ITR", "itr")),
        _slot_item(dt_id_b, _doc_type("Tax Exemption Cert", "tax_exempt")),
    ]
    slot = _slot(slot_type="group", min_required=2, items=items)
    student = _student(classification=StudentClassification.FRESHMAN)

    sub_a = _submission(doc_type_id=dt_id_a, status=SubmissionStatus.VERIFIED)
    sub_b = _submission(doc_type_id=dt_id_b, status=SubmissionStatus.VERIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub_a, sub_b)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].duplicate_submission_ids == []


@pytest.mark.asyncio
async def test_group_slot_counts_all_matches() -> None:
    """Group slot counts all matched submissions without capping."""
    dt_id_a = uuid4()
    dt_id_b = uuid4()
    items = [
        _slot_item(dt_id_a, _doc_type("ITR", "itr")),
        _slot_item(dt_id_b, _doc_type("Tax Exemption Cert", "tax_exempt")),
    ]
    slot = _slot(slot_type="group", min_required=2, items=items)
    student = _student(classification=StudentClassification.FRESHMAN)

    sub_a = _submission(doc_type_id=dt_id_a, status=SubmissionStatus.VERIFIED)
    sub_b = _submission(doc_type_id=dt_id_b, status=SubmissionStatus.VERIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub_a, sub_b)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].matched_count == 2
    assert result[0].is_complete is True


# ── Bug 7: compliance conflation ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_matched_count_separates_verified_vs_classified() -> None:
    """matched_count includes both VERIFIED and CLASSIFIED submissions;
    submission IDs are available for downstream analytics."""
    doc_type_id = uuid4()
    dt = _doc_type("Birth Certificate", "birth_cert")
    item = _slot_item(doc_type_id, dt)
    slot = _slot(min_required=1, items=[item])
    student = _student(classification=StudentClassification.FRESHMAN)

    sub_verified = _submission(
        doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED
    )
    sub_classified = _submission(
        doc_type_id=doc_type_id, status=SubmissionStatus.CLASSIFIED
    )

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub_verified, sub_classified)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].matched_count == 1
    assert len(result[0].matched_submission_ids) == 2
    assert sub_verified.id in result[0].matched_submission_ids
    assert sub_classified.id in result[0].matched_submission_ids
    assert sub_verified.status == SubmissionStatus.VERIFIED
    assert sub_classified.status == SubmissionStatus.CLASSIFIED


# ── Empty / no-submission state ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_slot_with_no_submissions() -> None:
    """Empty slot returns matched_count=0, is_complete=False, no IDs."""
    doc_type_id = uuid4()
    dt = _doc_type("Birth Certificate", "birth_cert")
    item = _slot_item(doc_type_id, dt)
    slot = _slot(min_required=1, items=[item])
    student = _student(classification=StudentClassification.FRESHMAN)

    db = AsyncMock()
    db.execute.return_value = _submissions_result()

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].matched_count == 0
    assert result[0].is_complete is False
    assert result[0].matched_submission_ids == []


# ── Classification filtering ──────────────────────────────────────────────


def test_filter_slots_by_classification_excludes_non_matching() -> None:
    """_filter_slots_by_classification excludes slots whose
    applicable_classifications don't include the student's classification."""
    dt_freshman = _doc_type(
        "Freshman Form", "freshman_form", applicable=["freshman"]
    )
    dt_transferee = _doc_type(
        "Transferee Form", "transferee_form", applicable=["transferee"]
    )

    slot_a = _slot(items=[_slot_item(uuid4(), dt_freshman)])
    slot_b = _slot(items=[_slot_item(uuid4(), dt_transferee)])

    result = _filter_slots_by_classification(
        [slot_a, slot_b], StudentClassification.FRESHMAN
    )

    assert len(result) == 1
    assert result[0] is slot_a


def test_filter_slots_by_classification_keeps_slot_with_empty_applicable() -> None:
    """Slots with empty applicable_classifications are kept (applies to all)."""
    dt_universal = _doc_type("ID Photo", "id_photo", applicable=[])
    dt_freshman = _doc_type(
        "Freshman Form", "freshman_form", applicable=["freshman"]
    )

    slot_a = _slot(items=[_slot_item(uuid4(), dt_universal)])
    slot_b = _slot(items=[_slot_item(uuid4(), dt_freshman)])

    result = _filter_slots_by_classification(
        [slot_a, slot_b], StudentClassification.TRANSFEREE
    )

    assert len(result) == 1
    assert result[0] is slot_a


def test_filter_slots_by_classification_returns_all_when_classification_none() -> None:
    """When classification is None, all slots pass the filter."""
    dt = _doc_type("Form", "form", applicable=["freshman"])
    slot = _slot(items=[_slot_item(uuid4(), dt)])

    result = _filter_slots_by_classification([slot], None)

    assert len(result) == 1
    assert result[0] is slot
