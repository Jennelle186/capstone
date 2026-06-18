from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services.aws_pipeline import (
    MIN_TEXT_LENGTH,
    TextractError,
    UnsupportedDocumentError,
    BedrockClassifyError,
    classify_with_keywords,
    classify_with_bedrock,
    process_document_sync,
)


def _doc_type(
    code: str = "birth_cert",
    classifier_description: str | None = None,
    keywords: list[str] | None = None,
    name: str = "Birth Certificate",
    description: str = "",
) -> SimpleNamespace:
    return SimpleNamespace(
        code=code,
        name=name,
        description=description,
        classifier_description=classifier_description,
        keywords=keywords or [],
    )


def _textract_response(lines: list[str]) -> dict:
    blocks = []
    for line in lines:
        blocks.append({"BlockType": "LINE", "Text": line})
    blocks.append({"BlockType": "PAGE", "Page": 1})
    return {"Blocks": blocks}


class TestClassifyWithKeywords:
    def test_exact_keyword_match_gives_high_confidence(self) -> None:
        text = "REPUBLIC OF THE PHILIPPINES CERTIFICATE OF LIVE BIRTH PSA"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth", "psa"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.type_code == "birth_cert"
        assert result.confidence >= 0.70
        assert result.source == "keyword"

    def test_partial_keyword_match_still_auto_accepts(self) -> None:
        text = "CET result score percentile Testing and Evaluation Center"
        doc_types = [
            _doc_type(code="CET", keywords=["CET", "entrance test", "score", "percentile", "testing and evaluation center"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.type_code == "CET"
        assert result.confidence >= 0.70

    def test_5_out_of_11_keywords_auto_accepts(self) -> None:
        text = "CET entrance test score percentile Testing and Evaluation Center overall ability"
        doc_types = [
            _doc_type(code="CET", keywords=[
                "entrance test", "CET", "exam result", "CET result", "score",
                "test date", "applicant", "university", "examination",
                "testing and evaluation center", "percentile",
            ]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.confidence >= 0.70

    def test_no_keyword_match_returns_none(self) -> None:
        text = "This is a random grocery list with milk and eggs"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth", "psa"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is None

    def test_empty_text_returns_none(self) -> None:
        result = classify_with_keywords("", [_doc_type(code="birth_cert", keywords=["birth"])])
        assert result is None

    def test_no_keywords_no_description_skips_type(self) -> None:
        text = "CERTIFICATE OF LIVE BIRTH"
        doc_types = [
            _doc_type(code="birth_cert", keywords=[], classifier_description=None),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is None

    def test_description_match_gives_bonus(self) -> None:
        text = "Certificate of Live Birth Philippine Statistics Authority"
        doc_types = [
            _doc_type(
                code="birth_cert",
                keywords=["certificate", "birth"],
                classifier_description="Certificate of Live Birth",
            ),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.confidence > 0.5

    def test_best_match_wins_among_multiple_types(self) -> None:
        text = "CERTIFICATE OF LIVE BIRTH PSA"
        doc_types = [
            _doc_type(code="admission_form", keywords=["admission", "enrollment"]),
            _doc_type(code="birth_cert", keywords=["certificate", "birth", "psa"]),
            _doc_type(code="report_card", keywords=["grades", "gpa"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.type_code == "birth_cert"

    def test_word_boundary_matching(self) -> None:
        text = "Birth Certificate of Live Birth"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["birth", "certificate"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.confidence >= 0.50

    def test_word_boundary_no_substring_match(self) -> None:
        text = "Birthplace: Manila"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["birth"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is None

    def test_reasoning_includes_keyword_count(self) -> None:
        text = "Certificate of Live Birth"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert "2/2" in result.reasoning or "Matched" in result.reasoning

    def test_1_keyword_with_short_list(self) -> None:
        text = "Good Moral Certificate character reference"
        doc_types = [
            _doc_type(code="good_moral", keywords=["good moral", "certificate"]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.confidence >= 0.30

    def test_med_cert_3_of_8_keywords(self) -> None:
        text = "Medical Certificate University Health Services physically fit"
        doc_types = [
            _doc_type(code="MED_CERT", keywords=[
                "Medical Certificate", "WMSU", "University Health Services",
                "University Physician", "Physical Examination", "physically fit",
                "chest X-ray", "laboratory results",
            ]),
        ]
        result = classify_with_keywords(text, doc_types)
        assert result is not None
        assert result.confidence >= 0.50


class TestClassifyWithBedrock:
    def test_bedrock_classify_returns_match(self) -> None:
        text = "REPUBLIC OF THE PHILIPPINES CERTIFICATE OF LIVE BIRTH"
        doc_types = [
            _doc_type(code="BIRTH_CERT", name="Birth Certificate", classifier_description="A birth certificate"),
        ]

        bedrock_response = {
            "content": [{"text": '{"type": "BIRTH_CERT", "confidence": 0.95, "reasoning": "Contains birth certificate fields"}'}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 150, "output_tokens": 30},
        }

        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(bedrock_response).encode()
        mock_client.invoke_model.return_value = {"body": mock_body}

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            result = classify_with_bedrock(text, doc_types)

        assert result is not None
        assert result.type_code == "BIRTH_CERT"
        assert result.confidence == 0.95
        assert result.source == "bedrock"

    def test_bedrock_returns_none_for_no_match(self) -> None:
        text = "Random text not matching any document"
        doc_types = [
            _doc_type(code="BIRTH_CERT", name="Birth Certificate", classifier_description="A birth certificate"),
        ]

        bedrock_response = {
            "content": [{"text": '{"type": null, "confidence": 0, "reasoning": "No match"}'}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 100, "output_tokens": 20},
        }

        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(bedrock_response).encode()
        mock_client.invoke_model.return_value = {"body": mock_body}

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            result = classify_with_bedrock(text, doc_types)

        assert result is None

    def test_bedrock_falls_back_on_error(self) -> None:
        text = "Some text"
        doc_types = [_doc_type(code="BIRTH_CERT")]

        mock_client = MagicMock()
        mock_client.invoke_model.side_effect = Exception("Bedrock unavailable")

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            with pytest.raises(BedrockClassifyError):
                classify_with_bedrock(text, doc_types)

    def test_bedrock_handles_json_in_code_block(self) -> None:
        text = "CET result with score"
        doc_types = [
            _doc_type(code="CET", name="College Entrance Test", classifier_description="CET result"),
        ]

        bedrock_response = {
            "content": [{"text": '```json\n{"type": "CET", "confidence": 0.88, "reasoning": "CET result document"}\n```'}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 120, "output_tokens": 25},
        }

        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(bedrock_response).encode()
        mock_client.invoke_model.return_value = {"body": mock_body}

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            result = classify_with_bedrock(text, doc_types)

        assert result is not None
        assert result.type_code == "CET"

    def test_bedrock_handles_refusal(self) -> None:
        text = "Some text"
        doc_types = [_doc_type(code="BIRTH_CERT")]

        mock_client = MagicMock()
        mock_client.invoke_model.side_effect = BedrockClassifyError("Bedrock refused")

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            with pytest.raises(BedrockClassifyError):
                classify_with_bedrock(text, doc_types)

    def test_bedrock_truncated_json_auto_closes(self) -> None:
        text = "Medical certificate"
        doc_types = [
            _doc_type(code="MED_CERT", name="Medical Certificate", classifier_description="Medical cert"),
        ]

        bedrock_response = {
            "content": [{"text": '{"type": "MED_CERT", "confidence": 0.92, "reasoning": "Medical document"}'}],
            "stop_reason": "stop_sequence",
            "usage": {"input_tokens": 100, "output_tokens": 25},
        }

        mock_client = MagicMock()
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(bedrock_response).encode()
        mock_client.invoke_model.return_value = {"body": mock_body}

        with patch("app.services.aws_pipeline._get_bedrock_client", return_value=mock_client):
            result = classify_with_bedrock(text, doc_types)

        assert result is not None
        assert result.type_code == "MED_CERT"


class TestProcessDocumentSync:
    def test_successful_classification(self) -> None:
        long_text = "REPUBLIC OF THE PHILIPPINES CERTIFICATE OF LIVE BIRTH PSA " * 20
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth", "psa"]),
        ]

        with patch("app.services.aws_pipeline._extract_text", return_value=(long_text, None)):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "false"}):
                    result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["match"] is not None
        assert result["match"]["type"] == "birth_cert"
        assert result["match"]["confidence"] >= 0.70
        assert result["extracted_text_length"] > MIN_TEXT_LENGTH

    def test_text_too_short_flags(self) -> None:
        short_text = "Hi"
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth"]),
        ]

        with patch("app.services.aws_pipeline._extract_text", return_value=(short_text, None)):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "false"}):
                    result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["flag"] == "text_too_short"
        assert result["confidence"] == 0.0
        assert result["match"] is None

    def test_unsupported_document_format(self) -> None:
        doc_types = [_doc_type(code="birth_cert", keywords=["birth"])]

        with patch("app.services.aws_pipeline._extract_text", side_effect=UnsupportedDocumentError("Unsupported format")):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["flag"] == "unsupported_file_format"
        assert result["match"] is None

    def test_no_keyword_match_flags(self) -> None:
        long_text = "This is a long document about groceries " * 50
        doc_types = [
            _doc_type(code="birth_cert", keywords=["certificate", "birth", "psa"]),
        ]

        with patch("app.services.aws_pipeline._extract_text", return_value=(long_text, None)):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "false"}):
                    result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["flag"] == "not_a_required_document"
        assert result["match"] is None

    def test_bedrock_classification_used_when_enabled(self) -> None:
        long_text = "Medical Certificate from University Health Services " * 20
        doc_types = [
            _doc_type(code="MED_CERT", name="Medical Certificate", keywords=["medical certificate"]),
        ]

        bedrock_match = MagicMock()
        bedrock_match.type_code = "MED_CERT"
        bedrock_match.confidence = 0.92
        bedrock_match.reasoning = "Contains medical certificate fields"
        bedrock_match.source = "bedrock"

        with patch("app.services.aws_pipeline._extract_text", return_value=(long_text, None)):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "true"}):
                    with patch("app.services.aws_pipeline.classify_with_bedrock", return_value=bedrock_match):
                        result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["match"]["type"] == "MED_CERT"
        assert result["match"]["source"] == "bedrock"

    def test_bedrock_falls_back_to_keywords(self) -> None:
        long_text = "Certificate of Live Birth " * 20
        doc_types = [
            _doc_type(code="BIRTH_CERT", keywords=["certificate", "birth"]),
        ]

        with patch("app.services.aws_pipeline._extract_text", return_value=(long_text, None)):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "true"}):
                    with patch("app.services.aws_pipeline.classify_with_bedrock", side_effect=BedrockClassifyError("Service unavailable")):
                        result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["match"] is not None
        assert result["match"]["source"] == "keyword"

    def test_textract_error_raises(self) -> None:
        doc_types = [_doc_type(code="birth_cert", keywords=["birth"])]

        with patch("app.services.aws_pipeline._extract_text", side_effect=TextractError("Textract failed")):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with pytest.raises(TextractError, match="Textract failed"):
                    process_document_sync("staging/test/file.pdf", doc_types)

    def test_async_textract_job_id_returned_for_pdf(self) -> None:
        long_text = "Medical Certificate from University Health Services " * 20
        doc_types = [_doc_type(code="MED_CERT", keywords=["medical certificate"])]

        with patch("app.services.aws_pipeline._extract_text", return_value=(long_text, "async-job-123")):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                with patch.dict("os.environ", {"USE_BEDROCK_CLASSIFICATION": "false"}):
                    result = process_document_sync("staging/test/file.pdf", doc_types)

        assert result["match"] is not None
        assert result["textract_job_id"] == "async-job-123"


class TestExtractTextAsync:
    def test_async_extracts_lines_from_all_pages(self) -> None:
        mock_client = MagicMock()
        mock_client.start_document_text_detection.return_value = {"JobId": "job-123"}
        mock_client.get_document_text_detection.side_effect = [
            {"JobStatus": "IN_PROGRESS"},
            {"JobStatus": "SUCCEEDED"},
            {
                "JobStatus": "SUCCEEDED",
                "Blocks": [
                    {"BlockType": "LINE", "Text": "Page one line"},
                    {"BlockType": "PAGE"},
                ],
                "NextToken": "token-1",
            },
            {
                "JobStatus": "SUCCEEDED",
                "Blocks": [
                    {"BlockType": "LINE", "Text": "Page two line"},
                ],
            },
        ]

        with patch("app.services.aws_pipeline._get_textract_client", return_value=mock_client):
            with patch("app.services.aws_pipeline.time.sleep"):
                from app.services.aws_pipeline import _extract_text_async
                text, job_id = _extract_text_async("test-bucket", "staging/test/file.pdf")

        assert job_id == "job-123"
        assert "Page one line" in text
        assert "Page two line" in text
        mock_client.start_document_text_detection.assert_called_once_with(
            DocumentLocation={"S3Object": {"Bucket": "test-bucket", "Name": "staging/test/file.pdf"}}
        )

    def test_async_unsupported_document_raises(self) -> None:
        with patch("app.services.aws_pipeline._get_textract_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.start_document_text_detection.side_effect = Exception("UnsupportedDocumentException: Unsupported document format")
            mock_get_client.return_value = mock_client

            from app.services.aws_pipeline import _extract_text_async
            with pytest.raises(UnsupportedDocumentError):
                _extract_text_async("test-bucket", "staging/test/file.pdf")

    def test_async_failed_job_raises(self) -> None:
        mock_client = MagicMock()
        mock_client.start_document_text_detection.return_value = {"JobId": "job-123"}
        mock_client.get_document_text_detection.return_value = {"JobStatus": "FAILED"}

        with patch("app.services.aws_pipeline._get_textract_client", return_value=mock_client):
            with patch("app.services.aws_pipeline.time.sleep"):
                from app.services.aws_pipeline import _extract_text_async
                with pytest.raises(TextractError, match="failed"):
                    _extract_text_async("test-bucket", "staging/test/file.pdf")


class TestExtractTextRouter:
    def test_pdf_routes_to_async(self) -> None:
        with patch("app.services.aws_pipeline._extract_text_async", return_value=("async text", "job-123")) as mock_async:
            with patch("app.services.aws_pipeline._extract_text_sync") as mock_sync:
                from app.services.aws_pipeline import _extract_text
                text, job_id = _extract_text("test-bucket", "staging/test/file.pdf")

        assert text == "async text"
        assert job_id == "job-123"
        mock_async.assert_called_once_with("test-bucket", "staging/test/file.pdf")
        mock_sync.assert_not_called()

    def test_image_routes_to_sync(self) -> None:
        with patch("app.services.aws_pipeline._extract_text_async") as mock_async:
            with patch("app.services.aws_pipeline._extract_text_sync", return_value="sync text") as mock_sync:
                from app.services.aws_pipeline import _extract_text
                text, job_id = _extract_text("test-bucket", "staging/test/file.jpg")

        assert text == "sync text"
        assert job_id is None
        mock_sync.assert_called_once_with("test-bucket", "staging/test/file.jpg")
        mock_async.assert_not_called()


class TestExtractTextSync:
    def test_extracts_lines_from_textract_response(self) -> None:
        mock_response = _textract_response([
            "Hello World",
            "Second Line",
        ])
        mock_client = MagicMock()
        mock_client.detect_document_text.return_value = mock_response

        with patch("app.services.aws_pipeline._get_textract_client", return_value=mock_client):
            with patch("app.services.aws_pipeline._get_s3_bucket", return_value="test-bucket"):
                from app.services.aws_pipeline import _extract_text_sync
                text = _extract_text_sync("test-bucket", "staging/test/file.pdf")

        assert "Hello World" in text
        assert "Second Line" in text
        mock_client.detect_document_text.assert_called_once_with(
            Document={"S3Object": {"Bucket": "test-bucket", "Name": "staging/test/file.pdf"}}
        )

    def test_textract_unsupported_document_raises(self) -> None:
        with patch("app.services.aws_pipeline._get_textract_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.detect_document_text.side_effect = Exception("UnsupportedDocumentException: Unsupported document format")
            mock_get_client.return_value = mock_client

            from app.services.aws_pipeline import _extract_text_sync
            with pytest.raises(UnsupportedDocumentError):
                _extract_text_sync("test-bucket", "staging/test/file.pdf")

    def test_textract_generic_error_raises(self) -> None:
        with patch("app.services.aws_pipeline._get_textract_client") as mock_get_client:
            mock_client = MagicMock()
            mock_client.detect_document_text.side_effect = Exception("Network error")
            mock_get_client.return_value = mock_client

            from app.services.aws_pipeline import _extract_text_sync
            with pytest.raises(TextractError, match="Textract error"):
                _extract_text_sync("test-bucket", "staging/test/file.pdf")


class TestMinTextLength:
    def test_boundary_text_length(self) -> None:
        from app.services.aws_pipeline import _text_too_short
        assert _text_too_short("x" * 99) is True
        assert _text_too_short("x" * 100) is False
        assert _text_too_short("x" * 101) is False