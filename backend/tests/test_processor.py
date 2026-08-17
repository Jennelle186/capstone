from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import AdminAuditLog, SubmissionStatus
from app.services.gcp_pipeline import GcpPipelineError
from app.services.processor import process_submission


def _doc_type(
    code: str = "transcript",
    classifier_description: str | None = "A transcript of records.",
    keywords: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        code=code,
        classifier_description=classifier_description,
        keywords=keywords or [],
    )


def _mock_session(submission, document_types=None):
    session = AsyncMock()
    session.get = AsyncMock(side_effect=[submission] + ([] if document_types is None else [submission]))

    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=document_types or [])))
    execute_result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=execute_result)
    return session


def _submission(status=SubmissionStatus.UPLOADED, is_compiled=False):
    return SimpleNamespace(
        id=uuid4(),
        student_id=uuid4(),
        status=status,
        is_compiled=is_compiled,
        file_key="staging/student-id/file.pdf",
        original_filename="file.pdf",
        mime_type="application/pdf",
        llama_job_id=None,
        document_type_id=None,
        classification_result=None,
    )


def _make_pipeline_result(
    match_type=None,
    confidence=0.0,
    reasoning="",
    source="keyword",
    extracted_text_length=500,
):
    result = {
        "extracted_text_length": extracted_text_length,
    }
    if match_type:
        result["match"] = {
            "type": match_type,
            "confidence": confidence,
            "reasoning": reasoning,
            "source": source,
        }
        result["status"] = "classified"
    return result


@pytest.mark.asyncio
async def test_process_submission_classifies_high_confidence_match() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.", keywords=["admission", "form"])

    session = _mock_session(submission, document_types=[doc_type])

    pipeline_result = _make_pipeline_result(
        match_type="ADMISSION_FORM",
        confidence=0.95,
        reasoning="Matched 2/2 keywords",
        source="gemini",
    )

    with patch("app.services.processor.asyncio.to_thread", return_value=pipeline_result):
        await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.document_type_id == doc_type.id
    assert submission.classification_result["type"] == "ADMISSION_FORM"
    assert submission.classification_result["confidence"] == 0.95
    assert submission.classification_result["source"] == "gemini"


@pytest.mark.asyncio
async def test_process_submission_flags_low_confidence_match() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.", keywords=["admission"])

    session = _mock_session(submission, document_types=[doc_type])

    pipeline_result = _make_pipeline_result(
        match_type="ADMISSION_FORM",
        confidence=0.55,
        reasoning="Matched 1/1 keywords",
    )

    with patch("app.services.processor.asyncio.to_thread", return_value=pipeline_result):
        await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "low_confidence"


@pytest.mark.asyncio
async def test_process_submission_deletes_non_required_document() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")

    session = _mock_session(submission, document_types=[doc_type])
    session.delete = AsyncMock()

    pipeline_result = _make_pipeline_result()

    with patch("app.services.processor.asyncio.to_thread", return_value=pipeline_result):
        await process_submission(session, submission.id)

    session.delete.assert_awaited_once_with(submission)


@pytest.mark.asyncio
async def test_process_submission_classified_when_no_rules() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    session = _mock_session(submission, document_types=[])

    await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.classification_result["note"] == "no_classification_rules_configured"


@pytest.mark.asyncio
async def test_process_submission_flags_compiled_documents() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    session = _mock_session(submission, document_types=[])

    await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "compiled_document_not_supported"


@pytest.mark.asyncio
async def test_process_submission_skips_when_not_uploaded() -> None:
    submission = _submission(status=SubmissionStatus.FLAGGED)
    session = _mock_session(submission, document_types=[])

    await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED


@pytest.mark.asyncio
async def test_process_submission_flags_on_pipeline_error() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")
    session = _mock_session(submission, document_types=[doc_type])

    with patch("app.services.processor.asyncio.to_thread", side_effect=GcpPipelineError("Gemini classification failed")):
        await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["error"] == "pipeline_error"


@pytest.mark.asyncio
async def test_process_submission_deletes_when_type_already_verified() -> None:
    """A predicted type that is already VERIFIED for the student causes the new
    submission to be hard-deleted (not CLASSIFIED, not FLAGGED) with an audit entry."""
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.", keywords=["admission"])

    session = AsyncMock()
    session.get = AsyncMock(return_value=submission)
    session.delete = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[doc_type])))
    # has_verified_submission reads scalar_one_or_none(); a non-None value means
    # a VERIFIED submission already exists for the predicted type.
    execute_result.scalar_one_or_none = MagicMock(return_value=uuid4())
    session.execute = AsyncMock(return_value=execute_result)

    pipeline_result = _make_pipeline_result(
        match_type="ADMISSION_FORM",
        confidence=0.95,
        reasoning="Matched",
    )

    with patch("app.services.processor.asyncio.to_thread", side_effect=[pipeline_result, None]):
        await process_submission(session, submission.id)

    session.delete.assert_awaited_once_with(submission)
    assert submission.status != SubmissionStatus.CLASSIFIED
    assert submission.status != SubmissionStatus.FLAGGED

    audit_calls = [
        c for c in session.add.call_args_list
        if c.args and isinstance(c.args[0], AdminAuditLog)
    ]
    assert len(audit_calls) == 1
    audit = audit_calls[0].args[0]
    assert audit.action == "AUTO_DELETED_DUPLICATE_VERIFIED"
    assert audit.entity_id == submission.id
    assert audit.audit_metadata["reason"] == "duplicate_verified"
