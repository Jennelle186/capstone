from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import SubmissionStatus
from app.services.pdf_service import CompiledSegment, PageClassification


def _doc_type(code: str) -> SimpleNamespace:
    return SimpleNamespace(code=code, id=uuid4())


def _parent() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        student_id=uuid4(),
        file_key="staging/abc.pdf",
        original_filename="compiled.pdf",
    )


def _classifications(*types: str | None) -> list[PageClassification]:
    return [
        PageClassification(page_index=i, type_code=t, confidence=0.9)
        for i, t in enumerate(types)
    ]


def _segments() -> list[CompiledSegment]:
    return [
        CompiledSegment(type_code="admission_form", ranges=[(0, 1)]),
        CompiledSegment(type_code="birth_certificate", ranges=[(2, 3)]),
    ]


@pytest.mark.asyncio
async def test_split_creates_classified_children() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form"), _doc_type("birth_certificate")]
    parent = _parent()
    session = MagicMock()

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a", b"b"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=False):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("admission_form", "admission_form", "birth_certificate", "birth_certificate"),
                        _segments(),
                        b"pdf",
                    )

    assert len(children) == 2
    assert all(c.status == SubmissionStatus.CLASSIFIED for c in children)
    assert children[0].document_type_id == doc_types[0].id
    assert children[0].page_range == "1-2"
    assert children[0].segment_index == 0
    assert children[0].page_count == 2
    assert children[0].parent_submission_id == parent.id
    assert children[1].document_type_id == doc_types[1].id
    assert children[1].page_range == "3-4"


@pytest.mark.asyncio
async def test_split_merges_noncontiguous_same_type() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form"), _doc_type("birth_certificate")]
    parent = _parent()
    session = MagicMock()
    segments = [
        CompiledSegment(type_code="admission_form", ranges=[(0, 0), (2, 2)]),
        CompiledSegment(type_code="birth_certificate", ranges=[(1, 1)]),
    ]

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a", b"b"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=False):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("admission_form", "birth_certificate", "admission_form"),
                        segments,
                        b"pdf",
                    )

    assert len(children) == 2
    assert children[0].document_type_id == doc_types[0].id
    assert children[0].page_range == "1-1,3-3"
    assert children[0].page_count == 2


@pytest.mark.asyncio
async def test_split_skips_verified_type() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form"), _doc_type("birth_certificate")]
    parent = _parent()
    session = MagicMock()

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a", b"b"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=True):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("admission_form", "admission_form", "birth_certificate", "birth_certificate"),
                        _segments(),
                        b"pdf",
                    )

    assert children == []
    assert session.add.called  # audit log recorded


@pytest.mark.asyncio
async def test_split_skips_non_required_type() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form"), _doc_type("birth_certificate")]
    parent = _parent()
    session = MagicMock()
    # Only admission_form is required; birth_certificate is not.
    required_type_ids = {doc_types[0].id}
    segments = [
        CompiledSegment(type_code="admission_form", ranges=[(0, 1)]),
        CompiledSegment(type_code="birth_certificate", ranges=[(2, 3)]),
    ]

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a", b"b"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=False):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("admission_form", "admission_form", "birth_certificate", "birth_certificate"),
                        segments,
                        b"pdf",
                        required_type_ids,
                    )

    # Only the required admission_form segment is kept.
    assert len(children) == 1
    assert children[0].document_type_id == doc_types[0].id

    audit_entries = [
        c.args[0]
        for c in session.add.call_args_list
        if c.args and getattr(c.args[0], "action", None) == "AUTO_DELETED_NOT_REQUIRED"
    ]
    assert len(audit_entries) == 1
    assert audit_entries[0].audit_metadata["reason"] == "compiled_segment_not_required"
    assert audit_entries[0].audit_metadata["document_type_code"] == "birth_certificate"


@pytest.mark.asyncio
async def test_split_skips_unresolvable_type() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form")]
    parent = _parent()
    session = MagicMock()
    segments = [CompiledSegment(type_code="mystery_type", ranges=[(0, 0)])]

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=False):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("mystery_type"),
                        segments,
                        b"pdf",
                    )

    # Unresolvable segments are removed (no child, no upload), not FLAGGED.
    assert children == []

    audit_entries = [
        c.args[0]
        for c in session.add.call_args_list
        if c.args and getattr(c.args[0], "action", None) == "AUTO_DELETED_COMPILED_UNKNOWN"
    ]
    assert len(audit_entries) == 1
    assert audit_entries[0].audit_metadata["reason"] == "compiled_segment_unknown"


@pytest.mark.asyncio
async def test_split_removes_unknown_and_keeps_known() -> None:
    from app.services.compiled_split import split_compiled_submission

    doc_types = [_doc_type("admission_form")]
    parent = _parent()
    session = MagicMock()
    # Two known admission-form pages + one unknown page in the middle.
    segments = [
        CompiledSegment(type_code="admission_form", ranges=[(0, 0), (2, 2)]),
        CompiledSegment(type_code="unclassified", ranges=[(1, 1)]),
    ]

    with patch("app.services.compiled_split.split_pdf_by_groups", return_value=[b"a", b"b"]):
        with patch("app.services.compiled_split.upload_file_bytes", return_value="k"):
            with patch("app.services.compiled_split.make_staging_key", side_effect=lambda sid, name: f"staging/{sid}/{name}"):
                with patch("app.services.compiled_split.has_verified_submission", new_callable=AsyncMock, return_value=False):
                    children = await split_compiled_submission(
                        session,
                        parent,
                        doc_types,
                        _classifications("admission_form", None, "admission_form"),
                        segments,
                        b"pdf",
                    )

    # Known admission_form segment kept; unknown segment removed.
    assert len(children) == 1
    assert children[0].document_type_id == doc_types[0].id
    assert children[0].status == SubmissionStatus.CLASSIFIED

    audit_entries = [
        c.args[0]
        for c in session.add.call_args_list
        if c.args and getattr(c.args[0], "action", None) == "AUTO_DELETED_COMPILED_UNKNOWN"
    ]
    assert len(audit_entries) == 1


@pytest.mark.asyncio
async def test_classify_page_images_maps_matches() -> None:
    from app.services.compiled_split import classify_page_images
    from app.services.gcp_pipeline import ClassificationMatch

    doc_types = [_doc_type("admission_form"), _doc_type("birth_certificate")]

    with patch(
        "app.services.compiled_split.classify_page_bytes",
        side_effect=[
            ClassificationMatch(type_code="admission_form", confidence=0.9, reasoning="", source="gemini"),
            ClassificationMatch(type_code="birth_certificate", confidence=0.8, reasoning="", source="gemini"),
        ],
    ):
        results = await classify_page_images([b"p1", b"p2"], doc_types)

    assert [r.type_code for r in results] == ["admission_form", "birth_certificate"]
    assert [r.page_index for r in results] == [0, 1]
