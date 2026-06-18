from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from app.services.gcp_pipeline import (
    _build_classification_schema,
    _normalize_text,
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
