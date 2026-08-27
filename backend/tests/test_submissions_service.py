from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus


@pytest.mark.asyncio
async def test_verify_submission_sets_status_to_verified() -> None:
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status="PENDING_DOCUMENTS",
        program_id=uuid4(),
        student_number=None,
        classification=None,
        gender=None,
        birth_date=None,
        address=None,
        admission_form_name=None,
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
        extracted_data=None,
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

    with patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
        mock_depts.return_value = {student.program_id}

        from app.services.submissions import verify_submission

        result = await verify_submission(db, str(submission.id), adviser)

    assert result is not None
    assert result["status"] == "verified"
    assert submission.status == SubmissionStatus.VERIFIED
    assert submission.verified_by == adviser.user_id
    assert submission.verified_at is not None
    assert submission.rejection_reason is None
    assert submission.flagged_at is None
    assert submission.flagged_by is None
    assert db.add.call_count >= 2


@pytest.mark.asyncio
async def test_verify_submission_does_not_set_application_status() -> None:
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status=None,
        program_id=uuid4(),
        student_number=None,
        classification=None,
        gender=None,
        birth_date=None,
        address=None,
        admission_form_name=None,
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
        extracted_data=None,
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

    with patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
        mock_depts.return_value = {student.program_id}

        from app.services.submissions import verify_submission

        result = await verify_submission(db, str(submission.id), adviser)

    assert result is not None
    assert result["status"] == "verified"
    assert student.application_status is None


@pytest.mark.asyncio
async def test_flag_submission_sets_flagged_status() -> None:
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status="PENDING_DOCUMENTS",
        program_id=uuid4(),
        student_number=None,
        classification=None,
        gender=None,
        birth_date=None,
        address=None,
        admission_form_name=None,
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
        extracted_data=None,
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

    with patch("app.services.submissions.get_student_slot_statuses", new_callable=AsyncMock) as mock_slots, \
         patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
        mock_slots.return_value = [SimpleNamespace(is_complete=True)]
        mock_depts.return_value = {student.program_id}

        from app.services.submissions import flag_submission

        result = await flag_submission(db, str(submission.id), adviser, "Missing required pages")

    assert result is not None
    assert result["status"] == "flagged"
    assert result["reason"] == "Missing required pages"
    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.rejection_reason == "Missing required pages"
    assert submission.flagged_by == adviser.user_id
    assert submission.flagged_at is not None
    assert db.add.call_count >= 2


@pytest.mark.asyncio
async def test_flag_submission_downgrades_application_status() -> None:
    student = SimpleNamespace(
        id=uuid4(),
        school_year_id=uuid4(),
        user_id=uuid4(),
        application_status="SUBMITTED_COMPLETE",
        program_id=uuid4(),
        student_number=None,
        classification=None,
        gender=None,
        birth_date=None,
        address=None,
        admission_form_name=None,
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
        extracted_data=None,
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

    with patch("app.services.submissions.get_student_slot_statuses", new_callable=AsyncMock) as mock_slots, \
         patch("app.services.submissions.get_department_ids_for_adviser", new_callable=AsyncMock) as mock_depts:
        mock_slots.return_value = [SimpleNamespace(is_complete=False)]
        mock_depts.return_value = {student.program_id}

        from app.services.submissions import flag_submission

        result = await flag_submission(db, str(submission.id), adviser, "Incomplete document")

    assert result is not None
    assert result["status"] == "flagged"
    assert submission.status == SubmissionStatus.FLAGGED
    assert student.application_status == "PENDING_DOCUMENTS"


def test_sync_extracted_to_student_sets_student_number() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "student_id_no", "value": "2024-00123"},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is True
    assert student.student_number == "2024-00123"


def test_sync_extracted_to_student_sets_gender() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "gender", "value": "Male"},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is True
    assert student.gender == "Male"


def test_sync_extracted_to_student_sets_birth_date() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "date_of_birth", "value": "2000-01-15"},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is True
    assert student.birth_date == date(2000, 1, 15)


def test_sync_extracted_to_student_sets_address() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "permanent_address", "value": "123 Main St, Manila"},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is True
    assert student.address == "123 Main St, Manila"


def test_sync_extracted_to_student_sets_admission_form_name() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "first_name", "value": "Juan"},
        "field_2": {"source_key": "last_name", "value": "Dela Cruz"},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is True
    assert student.admission_form_name == {"first_name": "Juan", "last_name": "Dela Cruz"}


def test_sync_extracted_to_student_skips_empty_values() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number="EXISTING-001",
        classification=None, gender="Female", birth_date=None, address="Old Address",
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = {
        "field_1": {"source_key": "student_id_no", "value": ""},
        "field_2": {"source_key": "gender", "value": ""},
        "field_3": {"source_key": "address", "value": ""},
    }

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is False
    assert student.student_number == "EXISTING-001"
    assert student.gender == "Female"
    assert student.address == "Old Address"


def test_sync_extracted_to_student_no_extracted_data() -> None:
    from app.services.students import _sync_extracted_to_student

    student = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), student_number=None,
        classification=None, gender=None, birth_date=None, address=None,
        admission_form_name=None, application_status=None,
        school_year_id=uuid4(), program_id=uuid4(),
    )
    extracted_data = None

    changed = _sync_extracted_to_student(student, extracted_data)

    assert changed is False
