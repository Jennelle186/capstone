from __future__ import annotations

from app.routers.documents import DownloadUrlResponse
from app.schemas.document_management import (
    DocumentTypeCreateRequest,
    RequirementAssignmentRequest,
)


def test_document_type_create_request_normalizes_code_and_keywords() -> None:
    payload = DocumentTypeCreateRequest(
        name="  Report Card  ",
        code=" report_card ",
        description="  Latest grade report. ",
        classifier_description="  document with grades ",
        keywords=[" grade ", "GRADE", " report "],
    )

    assert payload.name == "Report Card"
    assert payload.code == "REPORT_CARD"
    assert payload.description == "Latest grade report."
    assert payload.keywords == ["grade", "report"]


def test_requirement_assignment_request_dedupes_document_type_ids() -> None:
    doc_type_id = "8e33cc9a-8a4f-4f83-9f1f-cf616f1f7e8d"
    payload = RequirementAssignmentRequest(
        school_year_id="6e9b61da-1f68-43c3-8f6d-2d5f9e404934",
        document_type_ids=[doc_type_id, doc_type_id],
    )

    assert len(payload.document_type_ids) == 1


def test_download_url_response_serializes_url_and_expiry() -> None:
    payload = DownloadUrlResponse(
        url="https://storage.googleapis.com/bucket/key?X-Goog-Signature=abc",
        expires_in=3600,
    )

    assert payload.url.startswith("https://storage.googleapis.com/")
    assert payload.expires_in == 3600
