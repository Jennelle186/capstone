from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus, StudentClassification
from app.services.requirements import (
    _filter_slots_by_classification,
    get_bulk_student_slot_statuses,
    get_student_slot_statuses,
    has_verified_submission,
    latest_submission_per_type,
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


# ── has_verified_submission helper ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_has_verified_submission_returns_true_when_verified_exists() -> None:
    student_id = uuid4()
    doc_type_id = uuid4()
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid4()
    db.execute = AsyncMock(return_value=result)

    found = await has_verified_submission(db, student_id, doc_type_id)

    assert found is True


@pytest.mark.asyncio
async def test_has_verified_submission_returns_false_when_none() -> None:
    student_id = uuid4()
    doc_type_id = uuid4()
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    found = await has_verified_submission(db, student_id, doc_type_id)

    assert found is False


@pytest.mark.asyncio
async def test_has_verified_submission_excludes_submission_id() -> None:
    student_id = uuid4()
    doc_type_id = uuid4()
    excluded_id = uuid4()
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = uuid4()
    db.execute = AsyncMock(return_value=result)

    await has_verified_submission(
        db, student_id, doc_type_id, exclude_submission_id=excluded_id
    )

    stmt = db.execute.await_args.args[0]
    assert "!=" in str(stmt)


# ── latest_submission_per_type helper ──────────────────────────────────────


def test_latest_submission_per_type_keeps_newest_per_type() -> None:
    shared_type = uuid4()
    other_type = uuid4()
    older = SimpleNamespace(
        id=uuid4(),
        document_type_id=shared_type,
        created_at=datetime(2026, 8, 16, 10, 0, tzinfo=timezone.utc),
    )
    newer = SimpleNamespace(
        id=uuid4(),
        document_type_id=shared_type,
        created_at=datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc),
    )
    distinct = SimpleNamespace(
        id=uuid4(),
        document_type_id=other_type,
        created_at=datetime(2026, 8, 16, 11, 0, tzinfo=timezone.utc),
    )

    result = latest_submission_per_type([older, distinct, newer])

    result_ids = {s.id for s in result}
    assert newer.id in result_ids
    assert distinct.id in result_ids
    assert older.id not in result_ids
    assert len(result) == 2


def test_latest_submission_per_type_preserves_untyped() -> None:
    untyped = SimpleNamespace(id=uuid4(), document_type_id=None, created_at=None)
    typed = SimpleNamespace(
        id=uuid4(),
        document_type_id=uuid4(),
        created_at=datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc),
    )

    result = latest_submission_per_type([untyped, typed])

    assert len(result) == 2
    assert untyped in result
    assert typed in result


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


@pytest.mark.asyncio
async def test_solo_slot_verified_conflict_flag_with_multiple_extras() -> None:
    """A solo slot with one VERIFIED submission plus multiple non-verified extras
    exposes has_verified_conflict=True so clients render an auto-cleanup message."""
    doc_type_id = uuid4()
    dt = _doc_type("Admission Form", "admission_form")
    slot = _slot(min_required=1, items=[_slot_item(doc_type_id, dt)])
    student = _student(classification=StudentClassification.FRESHMAN)

    verified = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.VERIFIED)
    stale_a = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.CLASSIFIED)
    stale_b = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.CLASSIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(verified, stale_a, stale_b)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].has_verified_conflict is True
    # The verified document is definitive; the two extras remain in duplicate ids.
    assert len(result[0].duplicate_submission_ids) == 2


@pytest.mark.asyncio
async def test_solo_slot_no_verified_conflict_flag_without_verified() -> None:
    """A solo slot with only non-verified duplicates has_verified_conflict=False
    (a real choose-to-keep conflict, not an auto-cleanup case)."""
    doc_type_id = uuid4()
    dt = _doc_type("Birth Certificate", "birth_cert")
    slot = _slot(min_required=1, items=[_slot_item(doc_type_id, dt)])
    student = _student(classification=StudentClassification.FRESHMAN)

    sub_a = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.CLASSIFIED)
    sub_b = _submission(doc_type_id=doc_type_id, status=SubmissionStatus.CLASSIFIED)

    db = AsyncMock()
    db.execute.return_value = _submissions_result(sub_a, sub_b)

    with patch(
        "app.services.requirements.get_requirement_slots_for_student",
        new_callable=AsyncMock,
        return_value=[slot],
    ):
        result = await get_student_slot_statuses(db, student)

    assert len(result) == 1
    assert result[0].has_verified_conflict is False
    assert len(result[0].duplicate_submission_ids) == 1


@pytest.mark.asyncio
async def test_bulk_slot_statuses_orders_submissions_by_created_at() -> None:
    """The bulk path must order submissions by created_at (ascending) so that
    duplicate detection in list views is deterministic, matching the
    single-student path. Regression guard against the ordering being dropped
    from the bulk submissions query."""
    sy_id = uuid4()
    student = _student(
        school_year_id=sy_id, classification=StudentClassification.FRESHMAN
    )

    captured: list = []

    async def _fake_execute(stmt):
        # Record every statement issued so we can inspect the SQL shape.
        captured.append(stmt)
        return _submissions_result()  # empty result for all queries

    db = AsyncMock()
    db.execute.side_effect = _fake_execute

    await get_bulk_student_slot_statuses(db, [student])

    submissions_sql = [
        str(stmt)
        for stmt in captured
        if "FROM document_submissions" in str(stmt)
    ]
    assert submissions_sql, "No submissions query was issued by the bulk path"
    assert any(
        "ORDER BY document_submissions.created_at" in sql
        for sql in submissions_sql
    ), (
        "Bulk submissions query must order by created_at so duplicate "
        "detection is deterministic"
    )
