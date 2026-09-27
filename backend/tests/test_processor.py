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
    # _flag_submission (the error handler) still fetches the row via session.get.
    session.get = AsyncMock(return_value=submission)

    # The first execute call is the locked row fetch (FOR UPDATE) that returns
    # the submission itself. Subsequent execute calls serve document-type
    # lookups (scalars().all()) and conflict checks (scalar_one_or_none()).
    submission_result = MagicMock()
    submission_result.scalar_one_or_none = MagicMock(return_value=submission)

    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=document_types or [])))
    execute_result.scalar_one_or_none = MagicMock(return_value=None)

    state = {"first": True}

    async def fake_execute(*args, **kwargs):
        if state["first"]:
            state["first"] = False
            return submission_result
        return execute_result

    session.execute = AsyncMock(side_effect=fake_execute)
    return session


def _submission(status=SubmissionStatus.UPLOADED, is_compiled=False):
    return SimpleNamespace(
        id=uuid4(),
        student_id=uuid4(),
        status=status,
        is_compiled=is_compiled,
        is_compiled_parent=False,
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
async def test_process_submission_splits_compiled_document() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()

    from app.services.pdf_service import PageClassification
    pages = [
        PageClassification(0, "admission_form", 0.9),
        PageClassification(1, "birth_certificate", 0.8),
    ]
    child = SimpleNamespace(id=uuid4(), status=SubmissionStatus.CLASSIFIED)

    with patch("app.services.processor.download_file_bytes", return_value=b"pdf"):
        with patch("app.services.processor.normalize_to_pages", return_value=[b"p1", b"p2"]):
            with patch("app.services.processor.classify_page_images", new_callable=AsyncMock, return_value=pages):
                with patch("app.services.processor.split_compiled_submission", new_callable=AsyncMock, return_value=[child]):
                    await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.is_compiled_parent is True
    assert submission.page_count == 2
    assert submission.classification_result["compiled_parent"] is True
    assert len(submission.classification_result["segments"]) == 2


@pytest.mark.asyncio
async def test_process_submission_single_type_compiled_still_splits() -> None:
    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()

    from app.services.pdf_service import PageClassification
    pages = [PageClassification(0, "admission_form", 0.9), PageClassification(1, "admission_form", 0.9)]
    child = SimpleNamespace(id=uuid4(), status=SubmissionStatus.CLASSIFIED)

    with patch("app.services.processor.download_file_bytes", return_value=b"pdf"):
        with patch("app.services.processor.normalize_to_pages", return_value=[b"p1", b"p2"]):
            with patch("app.services.processor.classify_page_images", new_callable=AsyncMock, return_value=pages):
                with patch("app.services.processor.split_compiled_submission", new_callable=AsyncMock, return_value=[child]):
                    await process_submission(session, submission.id)

    # A user-flagged compiled PDF is ALWAYS split, even when every page
    # classifies to a single type — it becomes a compiled parent + one child.
    assert submission.status == SubmissionStatus.CLASSIFIED
    assert submission.is_compiled_parent is True
    assert submission.page_count == 2


@pytest.mark.asyncio
async def test_process_submission_compiled_download_failure_flags() -> None:
    from fastapi import HTTPException

    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()

    with patch(
        "app.services.processor.download_file_bytes",
        side_effect=HTTPException(status_code=502, detail="download boom"),
    ):
        await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["error"] == "pipeline_error"


@pytest.mark.asyncio
async def test_process_submission_compiled_all_null_pages_flags() -> None:
    from app.services.pdf_service import PageClassification

    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()

    pages = [PageClassification(0, None, 0.0), PageClassification(1, None, 0.0)]

    with patch("app.services.processor.download_file_bytes", return_value=b"pdf"):
        with patch("app.services.processor.normalize_to_pages", return_value=[b"p1", b"p2"]):
            with patch("app.services.processor.classify_page_images", new_callable=AsyncMock, return_value=pages):
                await process_submission(session, submission.id)

    assert submission.status == SubmissionStatus.FLAGGED
    assert submission.classification_result["flag"] == "compiled_pages_unrecognized"


@pytest.mark.asyncio
async def test_process_compiled_non_pdf_falls_through() -> None:
    from app.services.processor import _process_compiled_submission

    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    submission.mime_type = "image/jpeg"
    session = AsyncMock()

    with patch("app.services.processor.classify_page_images") as mock_classify:
        result = await _process_compiled_submission(session, submission, None, None)

    assert result is False
    mock_classify.assert_not_awaited()


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

    submission_result = MagicMock()
    submission_result.scalar_one_or_none = MagicMock(return_value=submission)

    execute_result = MagicMock()
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[doc_type])))
    # has_verified_submission reads scalar_one_or_none(); a non-None value means
    # a VERIFIED submission already exists for the predicted type.
    execute_result.scalar_one_or_none = MagicMock(return_value=uuid4())

    state = {"first": True}

    async def fake_execute(*args, **kwargs):
        if state["first"]:
            state["first"] = False
            return submission_result
        return execute_result

    session = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock(side_effect=fake_execute)

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


@pytest.mark.asyncio
async def test_process_submission_reads_row_with_for_update_lock() -> None:
    """The submission must be read through a FOR UPDATE (row-lock) SELECT so two
    concurrent workers cannot both pass the UPLOADED status check and split or
    classify the same submission twice."""
    from sqlalchemy.dialects import postgresql

    submission = _submission(status=SubmissionStatus.FLAGGED)
    session = _mock_session(submission, document_types=[])

    await process_submission(session, submission.id)

    # The first DB read is the locked row fetch, not a plain session.get().
    session.get.assert_not_awaited()
    first_call = session.execute.await_args_list[0]
    stmt = first_call.args[0]
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled.upper()


@pytest.mark.asyncio
async def test_process_submission_releases_lock_before_compiled_split() -> None:
    """Fix: the compiled path commits PROCESSING (releasing the FOR UPDATE lock)
    before running the expensive split, so delete/resolve requests on the same
    row are not blocked for the duration of GCS download + Gemini calls."""
    from app.services.pdf_service import PageClassification

    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()
    session.delete = AsyncMock()

    order = []

    async def commit():
        order.append("commit")

    session.commit = AsyncMock(side_effect=commit)

    async def fake_split(*args, **kwargs):
        order.append("split")
        return [SimpleNamespace(id=uuid4(), status=SubmissionStatus.CLASSIFIED)]

    pages = [
        PageClassification(0, "admission_form", 0.9),
        PageClassification(1, "birth_certificate", 0.8),
    ]

    with patch("app.services.processor.download_file_bytes", return_value=b"pdf"):
        with patch("app.services.processor.normalize_to_pages", return_value=[b"p1", b"p2"]):
            with patch("app.services.processor.classify_page_images", new_callable=AsyncMock, return_value=pages):
                with patch("app.services.processor.split_compiled_submission", new_callable=AsyncMock, side_effect=fake_split):
                    await process_submission(session, submission.id)

    # The PROCESSING commit must happen before the split (lock released first).
    assert "split" in order
    assert order.index("commit") < order.index("split")


@pytest.mark.asyncio
async def test_process_submission_deletes_compiled_parent_when_all_segments_verified() -> None:
    """Fix: a compiled PDF whose segments are all already VERIFIED is hard-deleted
    (with an audit entry) rather than left as an invisible orphan with no children."""
    from app.services.pdf_service import PageClassification

    submission = _submission(status=SubmissionStatus.UPLOADED, is_compiled=True)
    doc_type = _doc_type(code="admission_form")
    session = _mock_session(submission, document_types=[doc_type])
    session.add = MagicMock()
    session.delete = AsyncMock()

    pages = [
        PageClassification(0, "admission_form", 0.9),
        PageClassification(1, "birth_certificate", 0.8),
    ]

    with patch("app.services.processor.download_file_bytes", return_value=b"pdf"):
        with patch("app.services.processor.normalize_to_pages", return_value=[b"p1", b"p2"]):
            with patch("app.services.processor.classify_page_images", new_callable=AsyncMock, return_value=pages):
                with patch("app.services.processor.split_compiled_submission", new_callable=AsyncMock, return_value=[]):
                    with patch("app.services.processor.delete_file"):
                        await process_submission(session, submission.id)

    session.delete.assert_awaited_once_with(submission)
    assert submission.status != SubmissionStatus.CLASSIFIED
    assert submission.is_compiled_parent is False

    audit_calls = [
        c for c in session.add.call_args_list
        if c.args and isinstance(c.args[0], AdminAuditLog)
    ]
    assert len(audit_calls) == 1
    audit = audit_calls[0].args[0]
    assert audit.action == "AUTO_DELETED_COMPILED_CONTAINER"
    assert audit.audit_metadata["reason"] == "compiled_no_keepable_segments"
