from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus
from app.schemas.requirements import (
    SlotItemStatus,
    SlotStatusResponse,
)


def _make_slot_status(*, is_complete: bool, group_name: str | None = None, description: str | None = None, min_required: int = 1, matched_count: int = 0) -> SlotStatusResponse:
    return SlotStatusResponse(
        id=str(uuid4()),
        slot_type="solo",
        group_name=group_name,
        description=description,
        min_required=min_required,
        display_order=0,
        items=[SlotItemStatus(document_type_id=str(uuid4()), document_type_name="Test Doc", document_type_code="TD", is_primary=True)],
        is_complete=is_complete,
        matched_submission_ids=[],
        matched_count=matched_count,
    )


@pytest.mark.asyncio
async def test_application_status_complete_when_all_slots_satisfied() -> None:
    """Student gets SUBMITTED_COMPLETE when no slots are incomplete."""
    student = SimpleNamespace(
        id=uuid4(),
        application_status=None,
    )
    slot_statuses = [_make_slot_status(is_complete=True, matched_count=1)]

    incomplete = [s for s in slot_statuses if not s.is_complete]
    student.application_status = "PENDING_DOCUMENTS" if incomplete else "SUBMITTED_COMPLETE"

    assert student.application_status == "SUBMITTED_COMPLETE"
    assert incomplete == []


@pytest.mark.asyncio
async def test_application_status_pending_when_slots_incomplete() -> None:
    """Student gets PENDING_DOCUMENTS when slots are incomplete."""
    student = SimpleNamespace(
        id=uuid4(),
        application_status=None,
    )
    slot_statuses = [
        _make_slot_status(is_complete=False, matched_count=0, description="ID Proof"),
        _make_slot_status(is_complete=False, matched_count=0, description="Health Clearance"),
    ]

    incomplete = [s for s in slot_statuses if not s.is_complete]
    student.application_status = "PENDING_DOCUMENTS" if incomplete else "SUBMITTED_COMPLETE"

    assert student.application_status == "PENDING_DOCUMENTS"
    assert len(incomplete) == 2
    assert incomplete[0].description == "ID Proof"


@pytest.mark.asyncio
async def test_verify_submission_does_not_promote_application_status() -> None:
    """verify_submission should NOT promote application_status — only submit-batch triggers SUBMITTED_COMPLETE."""
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status="PENDING_DOCUMENTS",
        program_id=uuid4(),
        program_mismatch_pending=False,
        program_mismatch_extracted=None,
    )
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student.id,
        status=SubmissionStatus.SUBMITTED,
        original_filename="test.pdf",
        rejection_reason=None,
        flagged_at=None,
        flagged_by=None,
        verified_at=None,
        verified_by=None,
    )
    adviser = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
    )

    slot_statuses = [_make_slot_status(is_complete=True, matched_count=1)]

    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()

    submission_result = MagicMock()
    submission_result.scalar_one_or_none = MagicMock(return_value=submission)
    student_result = MagicMock()
    student_result.scalar_one_or_none = MagicMock(return_value=student)
    db.execute.side_effect = [submission_result, student_result]

    with patch("app.services.submissions.get_student_slot_statuses", new_callable=AsyncMock) as mock_slots,\
         patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
        mock_slots.return_value = slot_statuses
        mock_depts.return_value = {student.program_id}

        from app.services.submissions import verify_submission

        result = await verify_submission(db, str(submission.id), adviser)

    assert result is not None
    assert result["status"] == "verified"
    assert student.application_status == "PENDING_DOCUMENTS"


@pytest.mark.asyncio
async def test_verify_submission_does_not_promote_null_status() -> None:
    """verify_submission should NOT promote a student's application_status
    — only submit-batch triggers SUBMITTED_COMPLETE."""
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status=None,
        program_id=uuid4(),
        program_mismatch_pending=False,
        program_mismatch_extracted=None,
    )
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student.id,
        status=SubmissionStatus.SUBMITTED,
        original_filename="test.pdf",
        rejection_reason=None,
        flagged_at=None,
        flagged_by=None,
        verified_at=None,
        verified_by=None,
    )
    adviser = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
    )

    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.add = MagicMock()

    submission_result = MagicMock()
    submission_result.scalar_one_or_none = MagicMock(return_value=submission)
    student_result = MagicMock()
    student_result.scalar_one_or_none = MagicMock(return_value=student)
    db.execute.side_effect = [submission_result, student_result]

    with patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts, \
         patch("app.services.submissions.get_student_slot_statuses", new_callable=AsyncMock) as mock_slots:
        mock_depts.return_value = {student.program_id}
        mock_slots.return_value = [_make_slot_status(is_complete=True, matched_count=1)]

        from app.services.submissions import verify_submission

        result = await verify_submission(db, str(submission.id), adviser)

    assert result is not None
    assert result["status"] == "verified"
    assert student.application_status is None
