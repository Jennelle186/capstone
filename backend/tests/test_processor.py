from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus
from app.services.processor import (
    MAX_RULE_DESCRIPTION_LENGTH,
    _build_classification_rules,
    process_submission,
)


def _doc_type(
    code: str = "transcript",
    classifier_description: str | None = "A transcript of records.",
    keywords: list[str] | None = None,
) -> SimpleNamespace:
    """Return a lightweight stand-in for a DocumentType model instance."""
    return SimpleNamespace(
        id=uuid4(),
        code=code,
        classifier_description=classifier_description,
        keywords=keywords,
    )


def _mock_session(submission, document_types=None):
    """Return an async session mock that yields the given submission and types."""
    session = AsyncMock()
    session.get = AsyncMock(side_effect=[submission] + ([] if document_types is None else [submission]))

    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=document_types or [])))
    session.execute = AsyncMock(return_value=execute_result)
    return session


def _submission(status=SubmissionStatus.UPLOADED, is_compiled=False):
    return SimpleNamespace(
        id=uuid4(),
        status=status,
        is_compiled=is_compiled,
        file_key="staging/student-id/file.pdf",
        original_filename="file.pdf",
        mime_type="application/pdf",
        llama_job_id=None,
        document_type_id=None,
        classification_result=None,
    )


def test_build_classification_rules_uses_description_and_keywords() -> None:
    rules = _build_classification_rules(
        [
            _doc_type(
                code="transcript",
                classifier_description="A school transcript.",
                keywords=["grades", "gpa", "academic record"],
            ),
        ]
    )

    assert len(rules) == 1
    assert rules[0]["type"] == "transcript"
    assert rules[0]["description"] == "A school transcript. Keywords: grades, gpa, academic record."


def test_build_classification_rules_skips_missing_description() -> None:
    rules = _build_classification_rules(
        [
            _doc_type(code="transcript", classifier_description="A transcript."),
            _doc_type(code="empty", classifier_description=None),
        ]
    )

    assert len(rules) == 1
    assert rules[0]["type"] == "transcript"


def test_build_classification_rules_truncates_long_descriptions() -> None:
    long_description = "x" * 450
    rules = _build_classification_rules(
        [
            _doc_type(
                code="transcript",
                classifier_description=long_description,
                keywords=["grades", "gpa", "academic record", "university", "enrollment"],
            ),
        ]
    )

    assert len(rules) == 1
    assert len(rules[0]["description"]) <= MAX_RULE_DESCRIPTION_LENGTH


@pytest.mark.asyncio
async def test_process_submission_classifies_high_confidence_match() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")
    session = _mock_session(submission, document_types=[doc_type])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.processor.asyncio.to_thread", new_callable=AsyncMock, return_value="https://s3.example.com/file.pdf"):
            with patch("app.services.processor.upload_file", new_callable=AsyncMock, return_value="llama-file-id"):
                with patch("app.services.processor.classify_document", new_callable=AsyncMock, return_value={"result": {}}):
                    with patch("app.services.processor.extract_classification_result", return_value={
                        "type": "ADMISSION_FORM",
                        "confidence": 0.95,
                        "reasoning": "Matches admission form.",
                    }):
                        await process_submission(submission.id)

    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.llama_job_id == "llama-file-id"
    assert submission.document_type_id == doc_type.id
    assert submission.classification_result["type"] == "ADMISSION_FORM"
    assert submission.classification_result["confidence"] == 0.95


@pytest.mark.asyncio
async def test_process_submission_flags_low_confidence_match() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")
    session = _mock_session(submission, document_types=[doc_type])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.processor.asyncio.to_thread", new_callable=AsyncMock, return_value="https://s3.example.com/file.pdf"):
            with patch("app.services.processor.upload_file", new_callable=AsyncMock, return_value="llama-file-id"):
                with patch("app.services.processor.classify_document", new_callable=AsyncMock, return_value={"result": {}}):
                    with patch("app.services.processor.extract_classification_result", return_value={
                        "type": "ADMISSION_FORM",
                        "confidence": 0.55,
                        "reasoning": "Maybe.",
                    }):
                        await process_submission(submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "low_confidence"


@pytest.mark.asyncio
async def test_process_submission_flags_when_no_match() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")
    session = _mock_session(submission, document_types=[doc_type])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.processor.asyncio.to_thread", new_callable=AsyncMock, return_value="https://s3.example.com/file.pdf"):
            with patch("app.services.processor.upload_file", new_callable=AsyncMock, return_value="llama-file-id"):
                with patch("app.services.processor.classify_document", new_callable=AsyncMock, return_value={"result": None}):
                    with patch("app.services.processor.extract_classification_result", return_value=None):
                        await process_submission(submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "not_a_required_document"


@pytest.mark.asyncio
async def test_process_submission_classified_when_no_rules() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    session = _mock_session(submission, document_types=[])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.processor.asyncio.to_thread", new_callable=AsyncMock, return_value="https://s3.example.com/file.pdf"):
            with patch("app.services.processor.upload_file", new_callable=AsyncMock, return_value="llama-file-id"):
                await process_submission(submission.id)

    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.classification_result["note"] == "no_classification_rules_configured"


@pytest.mark.asyncio
async def test_process_submission_flags_compiled_documents() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    session = _mock_session(submission, document_types=[])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        await process_submission(submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "compiled_document_not_supported"


@pytest.mark.asyncio
async def test_process_submission_skips_when_not_uploaded() -> None:
    submission = _submission(status=SubmissionStatus.FLAGGED)
    session = _mock_session(submission, document_types=[])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        await process_submission(submission.id)

    # Status should remain unchanged; no further processing occurred.
    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.llama_job_id is None


@pytest.mark.asyncio
async def test_process_submission_flags_on_classify_error() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED)
    doc_type = _doc_type(code="ADMISSION_FORM", classifier_description="Admission form.")
    session = _mock_session(submission, document_types=[doc_type])

    with patch("app.services.processor.AsyncSessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=session)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.processor.asyncio.to_thread", new_callable=AsyncMock, return_value="https://s3.example.com/file.pdf"):
            with patch("app.services.processor.upload_file", new_callable=AsyncMock, side_effect=Exception("S3 presigned failed")):
                await process_submission(submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["error"] == "unexpected"
