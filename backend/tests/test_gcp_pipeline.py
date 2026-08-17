from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from app.services.gcp_pipeline import (
    _build_classification_schema,
    _extract_status_code,
    _normalize_text,
    _retry_on_gemini_error,
    _status_for_error,
    _usage_from_response,
    _word_set,
    classify_with_keywords,
    get_document_text,
)


def _doc_type(
    code: str = "TRANSCRIPT",
    name: str = "Transcript of Records",
    classifier_description: str | None = "A transcript of records.",
    keywords: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        code=code,
        name=name,
        classifier_description=classifier_description,
        keywords=keywords or [],
    )


def test_get_document_text_returns_empty_string() -> None:
    assert get_document_text("any/path.pdf") == ""
    assert get_document_text("any/path.png") == ""


def test_normalize_text() -> None:
    assert _normalize_text("  Hello World  ") == "hello world"
    assert _normalize_text("UPPERCASE") == "uppercase"
    assert _normalize_text("") == ""


def test_word_set() -> None:
    words = _word_set("hello world of test")
    assert "hello" in words
    assert "world" in words
    assert len(words) == 3  # "of" is too short (len <= 2)


def test_classify_with_keywords_returns_none_for_empty_text() -> None:
    dt = _doc_type(keywords=["admission", "form"])
    result = classify_with_keywords("", [dt])
    assert result is None


def test_classify_with_keywords_high_confidence_match() -> None:
    dt = _doc_type(code="ADMISSION_FORM", name="Admission Form", keywords=["admission", "form", "enrollment", "student", "apply"])
    text = "This is an admission form for enrollment. The student must apply using this admission form."

    result = classify_with_keywords(text, [dt])
    assert result is not None
    assert result.type_code == "ADMISSION_FORM"
    assert result.confidence >= 0.80
    assert result.source == "keyword"


def test_classify_with_keywords_no_match_returns_none() -> None:
    dt = _doc_type(code="REPORT_CARD", name="Report Card", keywords=["grade", "subject"])
    text = "This is an admission form with personal details."

    result = classify_with_keywords(text, [dt])
    assert result is None


def test_classify_with_keywords_low_confidence_no_match() -> None:
    dt = _doc_type(code="GOOD_MORAL", name="Good Moral", keywords=["good moral", "character", "certificate"])
    text = "The student is a person of strong ethical values."

    result = classify_with_keywords(text, [dt])
    assert result is None


def test_classify_with_keywords_matches_best_when_multiple_types() -> None:
    form_dt = _doc_type(code="ADMISSION_FORM", name="Admission Form", keywords=["admission", "form", "student"])
    transcript_dt = _doc_type(code="TRANSCRIPT", name="Transcript", keywords=["grade", "subject", "course"])
    text = "Admission form for student enrollment. The student admission form is required."

    result = classify_with_keywords(text, [form_dt, transcript_dt])
    assert result is not None
    assert result.type_code == "ADMISSION_FORM"


def test_classify_with_keywords_uses_description_bonus() -> None:
    dt = _doc_type(
        code="MED_CERT",
        name="Medical Certificate",
        classifier_description="issued by the university health services center certifying physical examination",
        keywords=["medical"],
    )
    text = "Medical certificate from the university health services. Physical examination completed."

    result = classify_with_keywords(text, [dt])
    assert result is not None
    assert result.type_code == "MED_CERT"
    assert result.confidence > 0.30


def test_build_classification_schema_includes_type_codes() -> None:
    dts = [
        _doc_type(code="ADMISSION_FORM"),
        _doc_type(code="BIRTH_CERT"),
    ]
    schema = _build_classification_schema(dts)
    assert schema["type"] == "object"
    assert "type" in schema["properties"]
    assert "confidence" in schema["properties"]
    assert "reasoning" in schema["properties"]
    assert "ADMISSION_FORM" in (schema["properties"]["type"].get("description") or "")
    assert "BIRTH_CERT" in (schema["properties"]["type"].get("description") or "")


# ── Retry logic (transient vs permanent error differentiation) ───────────


def _api_error(code: int) -> Exception:
    """Build a fake genai APIError-like exception carrying a ``.code`` status."""
    exc = SimpleNamespace(code=code)
    return exc  # type: ignore[return-value]


def test_extract_status_code_from_api_error() -> None:
    """Status code is read from the SDK error's ``.code`` attribute."""
    assert _extract_status_code(_api_error(504)) == 504
    assert _extract_status_code(_api_error(429)) == 429


def test_extract_status_code_falls_back_to_message_scan() -> None:
    """Non-APIError exceptions with the status embedded in text are still detected."""
    assert _extract_status_code(Exception("HTTP 504 Gateway Timeout")) == 504
    assert _extract_status_code(Exception("The read operation timed out")) is None


@patch("app.services.gcp_pipeline.time.sleep")
def test_retry_on_504(mock_sleep) -> None:
    """504 server timeout is transient and should be retried."""
    assert _retry_on_gemini_error(_api_error(504), "f.pdf", 0, "classification") is True
    mock_sleep.assert_called_once()


@patch("app.services.gcp_pipeline.time.sleep")
def test_retry_on_429(mock_sleep) -> None:
    """429 rate-limit is transient and should be retried."""
    assert _retry_on_gemini_error(_api_error(429), "f.pdf", 0, "classification") is True
    mock_sleep.assert_called_once()


@patch("app.services.gcp_pipeline.time.sleep")
def test_no_retry_on_client_error(mock_sleep) -> None:
    """Permanent 4xx client errors (auth/validation) must not be retried."""
    for code in (400, 401, 403, 404):
        assert _retry_on_gemini_error(_api_error(code), "f.pdf", 0, "classification") is False
    mock_sleep.assert_not_called()


@patch("app.services.gcp_pipeline.time.sleep")
def test_no_retry_when_attempts_exhausted(mock_sleep) -> None:
    """Even a transient error is not retried beyond the retry limit."""
    assert _retry_on_gemini_error(_api_error(504), "f.pdf", 3, "classification") is False
    mock_sleep.assert_not_called()


def test_usage_from_response_extracts_token_counts() -> None:
    """Token counts are read from the SDK response's usage_metadata."""
    usage = SimpleNamespace(
        prompt_token_count=100, candidates_token_count=20, total_token_count=120
    )
    response = SimpleNamespace(usage_metadata=usage)
    result = _usage_from_response(response)
    assert result == {
        "prompt_tokens": 100,
        "output_tokens": 20,
        "total_tokens": 120,
    }


def test_usage_from_response_defaults_to_zero_when_absent() -> None:
    """Missing usage_metadata yields zeroed token counts rather than crashing."""
    assert _usage_from_response(SimpleNamespace()) == {
        "prompt_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
    }


def test_status_for_error_mapping() -> None:
    """Failures map to stable observability status strings."""
    assert _status_for_error(_api_error(504)) == "failed_504"
    assert _status_for_error(_api_error(429)) == "failed_429"
    assert _status_for_error(_api_error(500)) == "failed_other"
    assert _status_for_error(_api_error(403)) == "failed_other"
    assert _status_for_error(Exception("The read operation timed out")) == "timeout"
