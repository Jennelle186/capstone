"""The adviser's queue and verify action follow the school year's current requirements."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import SubmissionStatus
from app.services import submissions as svc


def _queue_row(document_type_id, document_type_name):
    return SimpleNamespace(
        id=uuid4(),
        created_at=datetime.now(timezone.utc),
        status=SubmissionStatus.SUBMITTED,
        extracted_data=None,
        filled_online=False,
        document_type_id=document_type_id,
        classification=None,
        first_name="Ana",
        last_name="Reyes",
        student_id=uuid4(),
        student_number="20260001",
        document_type_name=document_type_name,
    )


def _db_returning_rows(rows):
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=rows)))
    return db


@pytest.mark.asyncio
async def test_queue_hides_submitted_file_for_a_document_no_longer_required():
    required_id, removed_id = uuid4(), uuid4()
    rows = [_queue_row(required_id, "Report Card"), _queue_row(removed_id, "Certificate of Indigency")]

    async def required_for(db, school_year_id, classification):
        return {required_id}

    with patch.object(svc, "get_school_year_id", AsyncMock(return_value=uuid4())), patch.object(
        svc, "get_department_ids_for_adviser", AsyncMock(return_value=[uuid4()])
    ), patch("app.services.requirements.required_type_ids_for_school_year", AsyncMock(side_effect=required_for)):
        result = await svc.list_submissions(_db_returning_rows(rows), SimpleNamespace(user_id=uuid4()), None)

    assert [r["document_type_name"] for r in result] == ["Report Card"]


@pytest.mark.asyncio
async def test_queue_shows_everything_when_the_school_year_has_no_requirements():
    rows = [_queue_row(uuid4(), "Report Card"), _queue_row(uuid4(), "Certificate of Indigency")]

    with patch.object(svc, "get_school_year_id", AsyncMock(return_value=uuid4())), patch.object(
        svc, "get_department_ids_for_adviser", AsyncMock(return_value=[uuid4()])
    ), patch("app.services.requirements.required_type_ids_for_school_year", AsyncMock(return_value=None)):
        result = await svc.list_submissions(_db_returning_rows(rows), SimpleNamespace(user_id=uuid4()), None)

    assert len(result) == 2


@pytest.mark.asyncio
async def test_verify_refuses_a_document_type_no_longer_required():
    submission_id, student_id, program_id, school_year_id = uuid4(), uuid4(), uuid4(), uuid4()
    removed_type = uuid4()
    submission = SimpleNamespace(
        id=submission_id,
        student_id=student_id,
        status=SubmissionStatus.SUBMITTED,
        document_type_id=removed_type,
        rejection_reason=None,
    )
    student = SimpleNamespace(
        id=student_id,
        school_year_id=school_year_id,
        classification=None,
        program_id=program_id,
        program_mismatch_pending=False,
        program_mismatch_extracted=None,
    )
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=submission)),
        MagicMock(scalar_one_or_none=MagicMock(return_value=student)),
    ])

    with patch.object(svc, "get_department_ids_for_adviser", AsyncMock(return_value=[program_id])), patch.object(
        svc, "required_type_ids_for_school_year", AsyncMock(return_value={uuid4()})
    ):
        with pytest.raises(HTTPException) as exc:
            await svc.verify_submission(db, str(submission_id), SimpleNamespace(user_id=uuid4()))

    assert exc.value.status_code == 409
    assert "no longer required" in exc.value.detail
    # The file is left as it was.
    assert submission.status == SubmissionStatus.SUBMITTED


@pytest.mark.asyncio
async def test_filter_rows_to_required_types_keeps_untyped_and_drops_removed_types():
    """Shared by the adviser queue and the pending-review count, so both drop the same rows."""
    from app.services import requirements

    required_id, removed_id = uuid4(), uuid4()
    untyped = _queue_row(None, "Misc")
    kept = _queue_row(required_id, "Report Card")
    dropped = _queue_row(removed_id, "Certificate of Indigency")

    with patch("app.services.requirements.required_type_ids_for_school_year", AsyncMock(return_value={required_id})):
        visible = await requirements.filter_rows_to_required_types(AsyncMock(), uuid4(), [untyped, kept, dropped])

    assert visible == [untyped, kept]


@pytest.mark.asyncio
async def test_dashboard_pending_reviews_skips_removed_document_types():
    """The dashboard count and the queue must agree: a removed type's open file is not pending review."""
    from app.services import analytics

    required_id, removed_id = uuid4(), uuid4()

    def analytics_row(document_type_id, status):
        return SimpleNamespace(
            id=uuid4(),
            status=status,
            created_at=datetime.now(timezone.utc),
            document_type_id=document_type_id,
            classification=None,
        )

    subs = [
        analytics_row(required_id, SubmissionStatus.SUBMITTED),
        analytics_row(removed_id, SubmissionStatus.SUBMITTED),
        analytics_row(required_id, SubmissionStatus.IN_REVIEW),
        analytics_row(required_id, SubmissionStatus.VERIFIED),
    ]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalar=MagicMock(return_value=3)),
        MagicMock(all=MagicMock(return_value=subs)),
    ])

    with patch.object(analytics, "get_active_school_year_id", AsyncMock(return_value=uuid4())), patch.object(
        analytics, "get_department_ids_for_adviser", AsyncMock(return_value=[uuid4()])
    ), patch("app.services.requirements.required_type_ids_for_school_year", AsyncMock(return_value={required_id})):
        result = await analytics.get_analytics(db, SimpleNamespace(user_id=uuid4()))

    assert result["pendingReviews"] == 2
    assert result["verifiedCount"] == 1
    assert result["totalStudents"] == 3


@pytest.mark.asyncio
async def test_queue_treats_no_applicable_requirement_as_nothing_required():
    """Requirements exist, but none apply to the student: the queue hides the file."""
    row = _queue_row(uuid4(), "Report Card")

    with patch.object(svc, "get_school_year_id", AsyncMock(return_value=uuid4())), patch.object(
        svc, "get_department_ids_for_adviser", AsyncMock(return_value=[uuid4()])
    ), patch("app.services.requirements.required_type_ids_for_school_year", AsyncMock(return_value=set())):
        result = await svc.list_submissions(_db_returning_rows([row]), SimpleNamespace(user_id=uuid4()), None)

    assert result == []
