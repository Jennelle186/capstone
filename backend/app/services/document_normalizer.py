"""Document type normalization utilities.

Maps free-form classification output from LLMs/VLMs to the canonical
DocumentType enum values stored in the database.
"""

from __future__ import annotations

import re
from typing import Iterable


# Canonical types supported by the system.
CANONICAL_TYPES = {
    "ADMISSION_FORM",
    "BIRTH_CERT",
    "REPORT_CARD",
    "CET",
    "GOOD_MORAL",
    "OTHERS",
}

# Keyword aliases grouped by canonical type.
TYPE_ALIASES: dict[str, list[str]] = {
    "ADMISSION_FORM": [
        "admission",
        "admission form",
        "application form",
        "enrolment form",
        "enrollment form",
        "student personal data",
    ],
    "BIRTH_CERT": [
        "birth",
        "birth certificate",
        "certificate of live birth",
        "live birth",
        "birth cert",
    ],
    "REPORT_CARD": [
        "report card",
        "report of learning",
        "form 138",
        "progress report",
        "report_card",
        "card",
    ],
    "CET": [
        "college entrance test",
        "entrance test",
        "cet",
        "entrance exam",
    ],
    "GOOD_MORAL": [
        "good moral",
        "moral character",
        "character certificate",
        "certificate of good moral",
    ],
}


def _normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_document_type(raw_type: str | None) -> str:
    """Normalize a raw document type string to a canonical type.

    Args:
        raw_type: Raw type from an LLM/VLM (may contain spaces, punctuation,
            or descriptive names like "Certificate of Live Birth").

    Returns:
        One of the canonical CANONICAL_TYPES values.
    """
    if not raw_type:
        return "OTHERS"

    cleaned = _normalize_text(str(raw_type))

    # Exact match first.
    upper = cleaned.upper().replace(" ", "_")
    if upper in CANONICAL_TYPES:
        return upper

    # Keyword/alias matching.
    for canonical, aliases in TYPE_ALIASES.items():
        for alias in aliases:
            if alias in cleaned:
                return canonical

    return "OTHERS"


def normalize_classification_result(result: dict | None) -> dict:
    """Normalize the `type` field inside a classification result dict.

    Returns a new dict with a canonical type and preserves other fields.
    """
    if not result:
        return {"type": "OTHERS", "confidence": 0.0, "reasoning": ""}

    normalized = dict(result)
    normalized["type"] = normalize_document_type(result.get("type"))
    return normalized
