from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from ..models import DocumentType

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

MIN_TEXT_LENGTH = 100
AUTO_ACCEPT_THRESHOLD = 0.80
REJECT_THRESHOLD = 0.30


class GcpPipelineError(Exception):
    pass


SYSTEM_INSTRUCTION = """You are an expert document processing AI for an academic institution.

TASK: CLASSIFICATION
Analyze the document and classify it into exactly ONE of the provided document types.

CONSTRAINTS:
- If the document does not match any type, set type to null and confidence to 0
- Do not include any text outside the JSON response"""


@dataclass
class ClassificationMatch:
    type_code: str | None
    confidence: float
    reasoning: str
    source: str = "keyword"


def get_document_text(file_key: str) -> str:
    return ""


def _normalize_text(text: str) -> str:
    return text.lower().strip()


def _word_set(text: str) -> set[str]:
    return {w.strip().strip(":.,;") for w in text.split() if len(w) > 2}


def classify_with_keywords(
    text: str,
    document_types: list[DocumentType],
) -> ClassificationMatch | None:
    if not text.strip():
        return None

    text_lower = text.lower()
    best_match: ClassificationMatch | None = None

    for dt in document_types:
        keywords = dt.keywords if isinstance(dt.keywords, list) else []
        description = (dt.classifier_description or "").strip()

        if not keywords and not description:
            continue

        matched = 0
        for kw in keywords:
            kw_str = str(kw).strip().lower()
            if not kw_str:
                continue
            pattern = r"\b" + re.escape(kw_str) + r"\b"
            if re.search(pattern, text_lower):
                matched += 1

        min_required = max(1, len(keywords) * 0.3) if keywords else 0
        if keywords and matched < min_required:
            continue

        if keywords and matched == 0:
            continue

        if matched >= 5:
            keyword_score = 0.80 + 0.20 * (matched / len(keywords))
        elif matched >= 3:
            keyword_score = 0.65 + 0.15 * (matched / len(keywords))
        elif matched >= 2:
            keyword_score = 0.50 + 0.20 * (matched / len(keywords))
        elif matched == 1:
            if len(keywords) <= 2:
                keyword_score = 0.45 + 0.10 * (matched / len(keywords))
            else:
                keyword_score = 0.30 + 0.10 * (matched / len(keywords))
        else:
            keyword_score = 0.0

        desc_bonus = 0.0
        if description:
            desc_words = [w.lower().strip(":.,;") for w in description.split() if len(w) > 3]
            if desc_words:
                desc_matched = sum(1 for w in desc_words if w in text_lower)
                if desc_matched >= len(desc_words) * 0.4:
                    desc_ratio = desc_matched / len(desc_words)
                    desc_bonus = 0.15 * desc_ratio

        confidence = min(keyword_score + desc_bonus, 1.0)

        if confidence < REJECT_THRESHOLD:
            continue

        if best_match is None or confidence > best_match.confidence:
            reasons = []
            if matched > 0 and keywords:
                reasons.append(f"Matched {matched}/{len(keywords)} keywords")
            if desc_bonus > 0:
                desc_words = [w.lower().strip(":.,;") for w in description.split() if len(w) > 3]
                if desc_words:
                    desc_matched_count = sum(1 for w in desc_words if w in text_lower)
                    reasons.append(f"Description match: {desc_matched_count}/{len(desc_words)} words")
            reasoning = "; ".join(reasons) if reasons else "No specific matches"
            best_match = ClassificationMatch(
                type_code=dt.code,
                confidence=round(confidence, 4),
                reasoning=reasoning,
                source="keyword",
            )

    return best_match


def _build_classification_schema(document_types: list[DocumentType]) -> dict:
    type_codes = [dt.code for dt in document_types]
    return {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "nullable": True,
                "description": f"Document type code. One of: {', '.join(type_codes)} or null if no match.",
            },
            "confidence": {"type": "number", "description": "Confidence score 0-1"},
            "reasoning": {"type": "string", "description": "Brief explanation"},
        },
        "required": ["type", "confidence", "reasoning"],
    }


def _build_classification_prompt(document_types: list[DocumentType]) -> str:
    lines = ["Classify the document into exactly ONE of the following types.", ""]
    lines.append("Available document types:")
    for dt in document_types:
        keywords = dt.keywords if isinstance(dt.keywords, list) else []
        kw_str = ", ".join(str(k) for k in keywords) if keywords else "none"
        desc = dt.classifier_description or dt.description or ""
        lines.append(f"- {dt.code} ({dt.name}): {desc}. Keywords: {kw_str}")
    lines.append("")
    lines.append('Respond with JSON: {"type": "<CODE or null>", "confidence": 0.0-1.0, "reasoning": "why this classification"}')
    return "\n".join(lines)


def classify_with_gemini(
    file_key: str,
    document_types: list[DocumentType],
) -> ClassificationMatch:
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    bucket = os.getenv("GCS_BUCKET", "")
    model_name = os.getenv("VERTEX_AI_MODEL")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
    )

    prompt = _build_classification_prompt(document_types)
    schema = _build_classification_schema(document_types)

    normalized_key = file_key.replace("\\", "/")
    file_uri = f"gs://{bucket}/{normalized_key}"
    mime_type = "application/pdf" if normalized_key.lower().endswith(".pdf") else "image/jpeg"

    logger.info("Sending %s to Gemini for classification (model=%s)", file_key, model_name)

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_uri(file_uri=file_uri, mime_type=mime_type),
                    types.Part.from_text(text=prompt),
                ],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=schema,
                    media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,
                    temperature=0.0,
                    http_options=types.HttpOptions(timeout=60_000),
                ),
            )
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            error_text = str(exc)
            if "429" in error_text and attempt < 3:
                wait = 2 ** attempt
                logger.warning(
                    "Rate limited (%s), retry %d/3 in %ss...", file_key, attempt + 1, wait
                )
                time.sleep(wait)
                continue
            logger.error("Gemini classification failed for %s: %s", file_key, exc)
            raise GcpPipelineError(f"Gemini classification failed: {exc}") from exc

    if last_error is not None:
        raise GcpPipelineError(f"Gemini classification failed after retries: {last_error}") from last_error

    if not response.text or not response.text.strip():
        logger.error("Gemini returned empty response for %s", file_key)
        raise GcpPipelineError("Gemini returned empty response")

    try:
        result = json.loads(response.text.strip())
    except (json.JSONDecodeError, AttributeError) as exc:
        logger.error("Gemini returned invalid JSON for %s: %s", file_key, response.text[:500])
        raise GcpPipelineError(f"Gemini returned invalid JSON: {response.text[:500]}") from exc

    type_code = result.get("type")
    confidence = float(result.get("confidence", 0.0))
    reasoning = result.get("reasoning", "")

    if not type_code:
        return ClassificationMatch(
            type_code=None,
            confidence=0.0,
            reasoning=reasoning or "Document does not match any required type",
            source="gemini",
        )

    return ClassificationMatch(
        type_code=type_code,
        confidence=min(max(confidence, 0.0), 1.0),
        reasoning=reasoning,
        source="gemini",
    )


def classify_document(
    file_key: str,
    document_types: list[DocumentType],
) -> dict[str, Any]:
    text = get_document_text(file_key)
    text_length = len(text)

    if text_length < MIN_TEXT_LENGTH:
        logger.info(
            "Scanned document (no extractable text), skipping keyword classifier for %s",
            file_key,
        )
        match = None
    else:
        match = classify_with_keywords(text, document_types)

    if match is not None and match.confidence >= AUTO_ACCEPT_THRESHOLD:
        logger.info(
            "Keyword auto-classified %s as %s (%.2f)",
            file_key, match.type_code, match.confidence,
        )
        return {
            "match": {
                "type": match.type_code,
                "confidence": match.confidence,
                "reasoning": match.reasoning,
                "source": "keyword",
            },
            "status": "classified",
            "extracted_text_length": text_length,
        }

    if match is not None and match.confidence >= REJECT_THRESHOLD:
        logger.info(
            "Keyword low-confidence %s as %s (%.2f), sending to Gemini",
            file_key, match.type_code, match.confidence,
        )
        gemini_match = classify_with_gemini(file_key, document_types)
        source = f"keyword({match.confidence})→gemini"
        return {
            "match": {
                "type": gemini_match.type_code,
                "confidence": gemini_match.confidence,
                "reasoning": gemini_match.reasoning,
                "source": source,
            },
            "status": "classified" if gemini_match.confidence >= AUTO_ACCEPT_THRESHOLD and gemini_match.type_code else "flagged_low_confidence",
            "extracted_text_length": text_length,
        }

    logger.info("Keywords rejected %s, sending to Gemini as fallback", file_key)
    gemini_match = classify_with_gemini(file_key, document_types)
    source = f"gemini"
    return {
        "match": {
            "type": gemini_match.type_code,
            "confidence": gemini_match.confidence,
            "reasoning": gemini_match.reasoning,
            "source": source,
        },
        "status": "classified" if gemini_match.confidence >= AUTO_ACCEPT_THRESHOLD and gemini_match.type_code else "flagged_not_required",
        "extracted_text_length": text_length,
    }


def process_document_sync(
    file_key: str,
    document_types: list[DocumentType],
) -> dict[str, Any]:
    result = classify_document(file_key, document_types)
    return result


# ── Admin Schema Blueprint Generation ──────────────────────────────────────


ADMIN_SCHEMA_SYSTEM_INSTRUCTION = """You are an expert Document Layout Architect and Meta-Schema Compiler.

TASK:
Analyze the provided document template. Your goal is NOT to extract a user's typed answers, but to deconstruct the form's structural layout, field connections, and option trees to generate an Admin Form Builder configuration schema.

CRITICAL: For every field, determine whether it is REQUIRED (mandatory) or optional. A field is required if:
- The form explicitly labels it with an asterisk (*), "(required)" text, or similar indicator
- The form instructions state the field must be filled out
- The field has no blank/empty option in a choice group
- The field is essential and cannot reasonably be left empty
  Fields without any such indicator should be marked as optional (required: false).

DECONSTRUCTION RULES:
1. SECTIONS: Group fields into logical sections based on visual boundaries and headers (e.g., "Admission Details", "Family Background").
2. HIERARCHY & LEVELS:
   - Assign 'hierarchy_level: 1' to base fields within a section.
   - If a group of fields belongs to a parental selection node (e.g., checkboxes nested underneath a "Track" or "Strand" choice), increment the hierarchy_level and set the 'parent_field_id'.
3. OPTIONS & CONNECTIONS: When an item consists of multiple printed text options next to selectable circles/boxes (like Enrollment Status, Semester, or Gender):
   - Set the ui_component to "radio_group" (if single choice) or "checkbox_group" (if multiple choice).
   - Enumerate EVERY choice item visible on the document into the "options" array. Keep labels verbatim.
   - For simple text inputs use "text_input", for dates use "date_picker", for dropdown menus use "dropdown".

OUTPUT FORMAT:
Return a clean, structured JSON payload matching the AdminSchemaBlueprint definition."""


def _build_blueprint_prompt(description: str | None = None, has_file: bool = True) -> str:
    if has_file:
        parts = [
            "Analyze this document template and deconstruct its structural layout.",
            "",
            "Identify every form section, every labeled input field, every choice option (radio buttons, checkboxes, dropdowns), and their hierarchical relationships. For each field, determine if it is required (mandatory) or optional based on printed indicators on the form.",
            "",
            "Pay special attention to:",
            "- Section headers that divide the form into logical blocks",
            "- Fields that are nested or conditional on a parent selection",
            "- All printed choice labels next to circles/boxes for radio/checkbox groups",
            "- The form's title and control/version number at the top",
        ]
    else:
        parts = [
            "Generate a form schema based purely on the following description.",
            "There is no document to analyze — invent a reasonable form structure that matches the described purpose.",
            "",
            "Create sections and fields that would typically appear on such a form. Include appropriate field types, UI components (text_input, radio_group, dropdown, date_picker, etc.), and choice options where relevant.",
        ]

    if description:
        parts.extend([
            "",
            "ADMIN'S EXTRACTION INSTRUCTIONS:",
            description,
        ])
    parts.extend([
        "",
        "Return a complete AdminSchemaBlueprint JSON.",
    ])
    return "\n".join(parts)


def _build_blueprint_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "form_name": {
                "type": "string",
                "description": "The overarching document name found at the top header.",
            },
            "form_control_id": {
                "type": "string",
                "description": "Document routing/version code (e.g. WMSU-AO-FR-001.02).",
            },
            "document_type": {
                "type": "string",
                "description": "The name of the document type (e.g. Report Card, Good Moral, Admission Form). Return empty string if not found.",
            },
            "effective_date": {
                "type": "string",
                "nullable": True,
                "description": "The effective or issue date found on the document (e.g. 2025-06-15). Return null if no date is found.",
            },
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "section_id": {
                            "type": "string",
                            "description": "Unique key for the logical form block (e.g. admission_details).",
                        },
                        "section_title": {
                            "type": "string",
                            "description": "The visual header title of the block (e.g. STUDENT PERSONAL DATA).",
                        },
                        "fields": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "field_id": {
                                        "type": "string",
                                        "description": "Unique system identifier (e.g. enrollment_status).",
                                    },
                                    "label": {
                                        "type": "string",
                                        "description": "The physical text label next to the input area on the page.",
                                    },
                                    "data_type": {
                                        "type": "string",
                                        "description": "System primitive: string, number, boolean, array, select, multi-select.",
                                    },
                                    "ui_component": {
                                        "type": "string",
                                        "description": "UI entry type: text_input, radio_group, checkbox_group, dropdown, date_picker.",
                                    },
                                    "hierarchy_level": {
                                        "type": "integer",
                                        "description": "Nesting depth: 1 for base fields, 2+ for conditional nested items.",
                                    },
                                    "required": {
                                        "type": "boolean",
                                        "description": "Whether this field is mandatory on the form (marked with an asterisk, 'required' label, or cannot be left blank).",
                                    },
                                    "parent_field_id": {
                                        "type": "string",
                                        "nullable": True,
                                        "description": "If nested under another field, reference its field_id.",
                                    },
                                    "options": {
                                        "type": "array",
                                        "nullable": True,
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "value": {
                                                    "type": "string",
                                                    "description": "System key for the option (e.g. freshman).",
                                                },
                                                "label": {
                                                    "type": "string",
                                                    "description": "The literal text printed on the form (e.g. Freshman).",
                                                },
                                            },
                                            "required": ["value", "label"],
                                        },
                                        "description": "For choice inputs, all options printed on the page.",
                                    },
                                },
                                "required": ["field_id", "label", "data_type", "ui_component", "required"],
                            },
                        },
                    },
                    "required": ["section_id", "section_title", "fields"],
                },
            },
        },
        "required": ["form_name", "form_control_id", "sections"],
    }


def generate_schema_blueprint(file_key: str | None = None, description: str | None = None) -> dict[str, Any]:
    """Analyze a document template using Gemini and return an AdminSchemaBlueprint.

    If file_key is provided, Gemini analyzes the document image; otherwise
    it generates a blueprint purely from the text description.
    """
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    bucket = os.getenv("GCS_BUCKET", "")
    model_name = os.getenv("VERTEX_AI_MODEL")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
    )

    has_file = file_key is not None
    if has_file:
        normalized_key = file_key.replace("\\", "/")  # type: ignore[union-attr]
        file_uri = f"gs://{bucket}/{normalized_key}"
        mime_type = "application/pdf" if normalized_key.lower().endswith(".pdf") else "image/jpeg"

    prompt = _build_blueprint_prompt(description, has_file=has_file)
    schema = _build_blueprint_schema()

    logger.info("Generating schema blueprint (file=%s, model=%s)", file_key, model_name)

    contents = []
    if has_file:
        contents.append(types.Part.from_uri(file_uri=file_uri, mime_type=mime_type))  # type: ignore[arg-type]
    contents.append(types.Part.from_text(text=prompt))

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=ADMIN_SCHEMA_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=schema,
                    media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,
                    temperature=0.0,
                    http_options=types.HttpOptions(timeout=60_000),
                ),
            )
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            error_text = str(exc)
            if "429" in error_text and attempt < 3:
                wait = 2 ** attempt
                logger.warning(
                    "Rate limited (%s), retry %d/3 in %ss...", file_key, attempt + 1, wait
                )
                time.sleep(wait)
                continue
            logger.error("Gemini blueprint generation failed for %s: %s", file_key, exc)
            raise GcpPipelineError(f"Gemini blueprint generation failed: {exc}") from exc

    if last_error is not None:
        raise GcpPipelineError(f"Gemini blueprint generation failed after retries: {last_error}") from last_error

    if not response.text or not response.text.strip():
        logger.error("Gemini returned empty response for %s", file_key)
        raise GcpPipelineError("Gemini returned empty blueprint response")

    try:
        result = json.loads(response.text.strip())
    except (json.JSONDecodeError, AttributeError) as exc:
        logger.error("Gemini returned invalid JSON for %s: %s", file_key, response.text[:500])
        raise GcpPipelineError(f"Gemini returned invalid JSON: {response.text[:500]}") from exc

    return result


# ── Student Field Extraction ────────────────────────────────────────────────


EXTRACTION_SYSTEM_INSTRUCTION = """You are a precise document data extraction AI for an academic institution.

TASK:
Extract the specified fields from the provided document. Return each field's value exactly as it appears on the document.

RULES:
1. Return values exactly as printed — do not paraphrase, correct spelling, or reformat
2. For checkboxes/radio buttons: return the label text of the selected option(s)
3. For dates: return in DD/MM/YYYY or YYYY-MM-DD format as printed
4. For numbers: return the raw numeric string including decimals if present
5. If a field's value is not found in the document, return an empty string for that field
6. Set confidence to 0.0–1.0 based on how clearly the value was found"""


EXTRACTION_PROMPT_TEMPLATE = """Extract the following fields from this document and return them as a JSON object.

Field definitions:
{field_definitions}

For each field, return {{"value": "<extracted text>", "confidence": <0.0-1.0>}}.
If a field is not found, set value to "" and confidence to 0.0.
Return ONLY a valid JSON object, no markdown, no explanation."""


def extract_fields_from_document(
    file_key: str,
    fields: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Extract field values from a document using Gemini.

    Args:
        file_key: GCS path to the document.
        fields: List of field definitions, each containing at minimum
                ``key``, ``type``, and ``description`` keys, and optionally
                ``options`` (list of dicts with ``value``/``label``) and
                ``required``.

    Returns:
        Dict mapping each field key to {value, confidence}.
    """
    project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    bucket = os.getenv("GCS_BUCKET", "")
    model_name = os.getenv("VERTEX_AI_MODEL")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
    )

    normalized_key = file_key.replace("\\", "/")
    file_uri = f"gs://{bucket}/{normalized_key}"
    mime_type = "application/pdf" if normalized_key.lower().endswith(".pdf") else "image/jpeg"

    field_lines: list[str] = []
    for f in fields:
        key = f.get("key", "unknown")
        desc = f.get("description", "")
        ftype = f.get("type", "string")
        required = f.get("required", False)
        raw_options = f.get("options")
        options_str = ""
        if isinstance(raw_options, list) and raw_options:
            labels = [o.get("label", o.get("value", "")) for o in raw_options if isinstance(o, dict)]
            options_str = f" [options: {', '.join(labels)}]"
        req_str = " (required)" if required else ""
        field_lines.append(f"  - {key} ({ftype}){req_str}: {desc}{options_str}")

    prompt = EXTRACTION_PROMPT_TEMPLATE.format(field_definitions="\n".join(field_lines))

    logger.info("Extracting %d fields from %s (model=%s)", len(fields), file_key, model_name)

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_uri(file_uri=file_uri, mime_type=mime_type),
                    types.Part.from_text(text=prompt),
                ],
                config=types.GenerateContentConfig(
                    system_instruction=EXTRACTION_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,
                    temperature=0.0,
                    http_options=types.HttpOptions(timeout=60_000),
                ),
            )
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            error_text = str(exc)
            if "429" in error_text and attempt < 3:
                wait = 2 ** attempt
                logger.warning("Rate limited (%s), retry %d/3 in %ss...", file_key, attempt + 1, wait)
                time.sleep(wait)
                continue
            logger.error("Gemini extraction failed for %s: %s", file_key, exc)
            raise GcpPipelineError(f"Gemini extraction failed: {exc}") from exc

    if last_error is not None:
        raise GcpPipelineError(f"Gemini extraction failed after retries: {last_error}") from last_error

    if not response.text or not response.text.strip():
        logger.error("Gemini returned empty extraction response for %s", file_key)
        raise GcpPipelineError("Gemini returned empty extraction response")

    try:
        result: dict[str, dict[str, Any]] = json.loads(response.text.strip())
    except (json.JSONDecodeError, AttributeError) as exc:
        logger.error("Gemini returned invalid JSON for %s: %s", file_key, response.text[:500])
        raise GcpPipelineError(f"Gemini returned invalid JSON: {response.text[:500]}") from exc

    return result
