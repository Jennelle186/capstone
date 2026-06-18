from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)

MIN_TEXT_LENGTH = 100

AUTO_ACCEPT_THRESHOLD = 0.70
REJECT_THRESHOLD = 0.30


class TextractError(Exception):
    pass


class TextractTimeoutError(Exception):
    pass


class UnsupportedDocumentError(Exception):
    pass


class BedrockClassifyError(Exception):
    pass


def _get_textract_client():
    region = os.getenv("AWS_REGION", "ap-southeast-1")
    return boto3.client(
        "textract",
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", ""),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", ""),
        config=Config(
            connect_timeout=10,
            read_timeout=60,
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def _get_bedrock_client():
    region = os.getenv("AWS_REGION", "ap-southeast-1")
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", ""),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", ""),
        config=Config(
            connect_timeout=10,
            read_timeout=60,
            retries={"max_attempts": 2, "mode": "standard"},
        ),
    )


def _get_s3_bucket() -> str:
    bucket = os.getenv("S3_BUCKET", "").strip()
    if not bucket:
        raise TextractError("S3_BUCKET is not configured.")
    return bucket


def _is_image_file(key: str) -> bool:
    ext = key.lower().split(".")[-1] if "." in key else ""
    return ext in {"png", "jpg", "jpeg", "tiff", "tif", "gif", "bmp", "webp"}


def _is_pdf_file(key: str) -> bool:
    return key.lower().endswith(".pdf")


def _handle_textract_exception(exc: Exception) -> None:
    if isinstance(exc, (TextractError, UnsupportedDocumentError)):
        raise
    error_class_name = type(exc).__name__
    error_message = str(exc)
    if "UnsupportedDocument" in error_class_name or "UnsupportedDocument" in error_message:
        raise UnsupportedDocumentError(
            f"Textract does not support this document format: {exc}"
        ) from exc
    if "DocumentTooLarge" in error_class_name or "DocumentTooLarge" in error_message:
        raise TextractError(f"Textract document too large: {exc}") from exc
    if "ProvisionedThroughputExceeded" in error_class_name or "ProvisionedThroughputExceeded" in error_message:
        raise TextractError(f"Textract throughput exceeded: {exc}") from exc
    if "Throttling" in error_class_name or "Throttling" in error_message:
        raise TextractError(f"Textract throttled: {exc}") from exc
    if "InvalidParameter" in error_class_name or "InvalidParameter" in error_message:
        raise TextractError(f"Textract invalid parameter: {exc}") from exc
    raise TextractError(f"Textract error: {exc}") from exc


def _extract_text_sync(bucket: str, key: str) -> str:
    client = _get_textract_client()
    try:
        response = client.detect_document_text(
            Document={"S3Object": {"Bucket": bucket, "Name": key}}
        )
    except Exception as exc:
        _handle_textract_exception(exc)

    blocks = response.get("Blocks", [])
    lines = []
    for block in blocks:
        if block.get("BlockType") == "LINE" and block.get("Text"):
            lines.append(block["Text"])
    return " ".join(lines)


def _extract_text_async(bucket: str, key: str) -> tuple[str, str]:
    client = _get_textract_client()
    try:
        start_response = client.start_document_text_detection(
            DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
        )
    except Exception as exc:
        _handle_textract_exception(exc)
        raise

    job_id = start_response["JobId"]
    logger.info("Started async Textract text detection job %s for s3://%s/%s", job_id, bucket, key)

    max_polls = 120
    poll_interval = 2
    status = "IN_PROGRESS"
    for _ in range(max_polls):
        response = client.get_document_text_detection(JobId=job_id)
        status = response.get("JobStatus", "IN_PROGRESS")
        if status in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
            break
        time.sleep(poll_interval)
    else:
        raise TextractTimeoutError(
            f"Async Textract job {job_id} did not complete within {max_polls * poll_interval} seconds"
        )

    if status == "FAILED":
        raise TextractError(f"Async Textract job {job_id} failed")
    if status == "PARTIAL_SUCCESS":
        logger.warning("Async Textract job %s completed with partial success", job_id)

    lines = []
    next_token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"JobId": job_id}
        if next_token:
            kwargs["NextToken"] = next_token
        response = client.get_document_text_detection(**kwargs)
        for block in response.get("Blocks", []):
            if block.get("BlockType") == "LINE" and block.get("Text"):
                lines.append(block["Text"])
        next_token = response.get("NextToken")
        if not next_token:
            break

    return " ".join(lines), job_id


def _extract_text(bucket: str, key: str) -> tuple[str, str | None]:
    if _is_image_file(key):
        return _extract_text_sync(bucket, key), None
    if _is_pdf_file(key):
        return _extract_text_async(bucket, key)
    return _extract_text_sync(bucket, key), None


def _text_too_short(text: str) -> bool:
    return len(text.strip()) < MIN_TEXT_LENGTH


@dataclass
class ClassificationMatch:
    type_code: str
    confidence: float
    reasoning: str
    source: str = "keyword"


def classify_with_keywords(
    text: str,
    document_types: list[Any],
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
                    desc_matched = sum(1 for w in desc_words if w in text_lower)
                    reasons.append(f"Description match: {desc_matched}/{len(desc_words)} words")
            reasoning = "; ".join(reasons) if reasons else "No specific matches"
            best_match = ClassificationMatch(
                type_code=dt.code,
                confidence=round(confidence, 4),
                reasoning=reasoning,
                source="keyword",
            )

    return best_match


BEDROCK_SYSTEM_PROMPT = """You are a document classifier for a university enrollment system. Your task is to classify OCR text from uploaded documents into the correct document type.

Rules:
- Classify the document into exactly ONE of the provided document types.
- Return a JSON object with three fields: "type" (the document type code), "confidence" (a number between 0 and 1), and "reasoning" (a brief explanation).
- If the document does not match any type, return: {"type": null, "confidence": 0, "reasoning": "Document does not match any required document type"}
- If the text appears to be a spoofed or fake document (e.g., just keywords without real document structure), return a low confidence score.
- Return ONLY valid JSON. No markdown, no explanation outside the JSON object."""

MAX_OCR_CHARS = 8000


def _build_type_descriptions(document_types: list[Any]) -> str:
    lines = []
    for dt in document_types:
        keywords = dt.keywords if isinstance(dt.keywords, list) else []
        kw_str = ", ".join(str(k) for k in keywords) if keywords else "none"
        desc = dt.classifier_description or dt.description or ""
        lines.append(f"- {dt.code} ({dt.name}): {desc} Keywords: {kw_str}")
    return "\n".join(lines)


def classify_with_bedrock(
    text: str,
    document_types: list[Any],
) -> ClassificationMatch | None:
    if not text.strip():
        return None

    client = _get_bedrock_client()
    model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-haiku-4-5-20251001-v1:0")

    type_descriptions = _build_type_descriptions(document_types)

    user_content = (
        f"Document types:\n{type_descriptions}\n\n"
        f"Classify the following OCR text:\n\n{text[:MAX_OCR_CHARS]}"
    )

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 512,
        "temperature": 0.0,
        "system": BEDROCK_SYSTEM_PROMPT,
        "stop_sequences": ["}\n"],
        "messages": [
            {
                "role": "user",
                "content": user_content,
            }
        ],
    }

    type_code_map = {dt.code: dt for dt in document_types}

    try:
        response = client.invoke_model(
            modelId=model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
    except Exception as exc:
        logger.warning("Bedrock classify failed, falling back to keywords: %s", exc)
        raise BedrockClassifyError(f"Bedrock error: {exc}") from exc

    response_body = json.loads(response["body"].read())

    usage = response_body.get("usage", {})
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    logger.info(
        "Bedrock classify token usage: input=%d, output=%d",
        input_tokens,
        output_tokens,
    )

    stop_reason = response_body.get("stop_reason", "")
    if stop_reason == "refusal":
        logger.warning("Bedrock refused to classify the document")
        raise BedrockClassifyError("Bedrock refused to process the document (content policy)")

    content_blocks = response_body.get("content", [])
    if not content_blocks:
        raise BedrockClassifyError("Bedrock returned empty content")

    text_response = content_blocks[0].get("text", "").strip()

    json_str = text_response
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0].strip()
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0].strip()

    if not json_str.endswith("}"):
        json_str += "}"

    try:
        result = json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("Bedrock returned non-JSON response: %s", text_response[:200])
        raise BedrockClassifyError(f"Bedrock returned invalid JSON: {text_response[:200]}")

    type_code = result.get("type")
    confidence = float(result.get("confidence", 0.0))
    reasoning = result.get("reasoning", "")

    if not type_code or type_code not in type_code_map:
        return None

    return ClassificationMatch(
        type_code=type_code,
        confidence=min(max(confidence, 0.0), 1.0),
        reasoning=reasoning,
        source="bedrock",
    )


def process_document_sync(
    file_key: str,
    document_types: list[Any],
) -> dict[str, Any]:
    bucket = _get_s3_bucket()

    try:
        text, textract_job_id = _extract_text(bucket, file_key)
    except UnsupportedDocumentError as exc:
        logger.warning("Unsupported document format for %s: %s", file_key, exc)
        return {
            "match": None,
            "flag": "unsupported_file_format",
            "confidence": 0.0,
            "reasoning": str(exc),
            "extracted_text_length": 0,
            "textract_job_id": None,
        }
    except TextractTimeoutError as exc:
        logger.error("Textract async timeout for %s: %s", file_key, exc)
        return {
            "match": None,
            "flag": "textract_timeout",
            "confidence": 0.0,
            "reasoning": str(exc),
            "extracted_text_length": 0,
            "textract_job_id": None,
        }

    logger.info(
        "Textract extracted %d characters from s3://%s/%s",
        len(text),
        bucket,
        file_key,
    )

    if _text_too_short(text):
        return {
            "match": None,
            "flag": "text_too_short",
            "confidence": 0.0,
            "extracted_text_length": len(text),
            "textract_job_id": None,
        }

    match: ClassificationMatch | None = None
    classification_source = "keyword"

    use_bedrock = os.getenv("USE_BEDROCK_CLASSIFICATION", "true").strip().lower() == "true"

    if use_bedrock:
        try:
            match = classify_with_bedrock(text, document_types)
            if match is not None:
                classification_source = match.source
                logger.info(
                    "Bedrock classified %s as %s (%.2f)",
                    file_key,
                    match.type_code,
                    match.confidence,
                )
        except BedrockClassifyError as exc:
            logger.warning("Bedrock classification failed for %s, falling back to keywords: %s", file_key, exc)

    if match is None:
        match = classify_with_keywords(text, document_types)
        if match is not None:
            classification_source = match.source

    if match is None:
        return {
            "match": None,
            "flag": "not_a_required_document",
            "confidence": 0.0,
            "reasoning": "No keywords matched.",
            "extracted_text_length": len(text),
            "textract_job_id": None,
        }

    raw_confidence = match.confidence
    if raw_confidence >= AUTO_ACCEPT_THRESHOLD:
        status = "classified"
    elif raw_confidence >= REJECT_THRESHOLD:
        status = "flagged_low_confidence"
    else:
        status = "flagged_not_required"

    return {
        "match": {
            "type": match.type_code,
            "confidence": round(raw_confidence, 4),
            "reasoning": match.reasoning,
            "source": classification_source,
        },
        "status": status,
        "extracted_text_length": len(text),
        "textract_job_id": textract_job_id,
    }


# ── KIE / Extraction ──────────────────────────────────────────────────────────


def _get_kie_text(block: dict, block_map: dict[str, dict]) -> str:
    parts = []
    for relationship in block.get("Relationships", []):
        if relationship.get("Type") != "CHILD":
            continue
        for child_id in relationship.get("Ids", []):
            child = block_map.get(child_id)
            if not child:
                continue
            if child.get("BlockType") == "WORD":
                parts.append(child.get("Text", ""))
            elif child.get("BlockType") == "SELECTION_ELEMENT":
                status = child.get("SelectionStatus", "NOT_SELECTED")
                parts.append("[X]" if status == "SELECTED" else "[ ]")
    return " ".join(parts).strip()


def _extract_key_value_pairs(blocks: list[dict], block_map: dict[str, dict]) -> dict[str, str]:
    key_blocks: dict[str, dict] = {}
    value_blocks: dict[str, dict] = {}
    for block in blocks:
        if block.get("BlockType") == "KEY_VALUE_SET":
            entity_types = block.get("EntityTypes", [])
            if "KEY" in entity_types:
                key_blocks[block["Id"]] = block
            elif "VALUE" in entity_types:
                value_blocks[block["Id"]] = block

    pairs: dict[str, str] = {}
    for key_id, key_block in key_blocks.items():
        key_text = _get_kie_text(key_block, block_map)
        value_id = None
        for relationship in key_block.get("Relationships", []):
            if relationship.get("Type") == "VALUE" and relationship.get("Ids"):
                value_id = relationship["Ids"][0]
                break
        value_text = ""
        if value_id and value_id in value_blocks:
            value_text = _get_kie_text(value_blocks[value_id], block_map)
        if key_text:
            pairs[key_text] = value_text
    return pairs


def _extract_kie_sync(bucket: str, key: str) -> dict[str, str]:
    client = _get_textract_client()
    try:
        response = client.analyze_document(
            Document={"S3Object": {"Bucket": bucket, "Name": key}},
            FeatureTypes=["FORMS"],
        )
    except Exception as exc:
        _handle_textract_exception(exc)

    blocks = response.get("Blocks", [])
    block_map = {b["Id"]: b for b in blocks}
    return _extract_key_value_pairs(blocks, block_map)


def _extract_kie_async(bucket: str, key: str) -> dict[str, str]:
    client = _get_textract_client()
    try:
        start_response = client.start_document_analysis(
            DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
            FeatureTypes=["FORMS"],
        )
    except Exception as exc:
        _handle_textract_exception(exc)

    job_id = start_response["JobId"]
    logger.info("Started async Textract KIE job %s for s3://%s/%s", job_id, bucket, key)

    max_polls = 120
    poll_interval = 2
    for _ in range(max_polls):
        response = client.get_document_analysis(JobId=job_id)
        status = response.get("JobStatus", "IN_PROGRESS")
        if status in ("SUCCEEDED", "FAILED", "PARTIAL_SUCCESS"):
            break
        time.sleep(poll_interval)
    else:
        raise TextractTimeoutError(
            f"Async Textract KIE job {job_id} did not complete within {max_polls * poll_interval} seconds"
        )

    if status == "FAILED":
        raise TextractError(f"Async Textract KIE job {job_id} failed")

    all_blocks: list[dict] = []
    next_token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"JobId": job_id}
        if next_token:
            kwargs["NextToken"] = next_token
        response = client.get_document_analysis(**kwargs)
        all_blocks.extend(response.get("Blocks", []))
        next_token = response.get("NextToken")
        if not next_token:
            break

    block_map = {b["Id"]: b for b in all_blocks}
    return _extract_key_value_pairs(all_blocks, block_map)


def _extract_kie(bucket: str, key: str) -> dict[str, str]:
    if _is_image_file(key):
        return _extract_kie_sync(bucket, key)
    if _is_pdf_file(key):
        return _extract_kie_async(bucket, key)
    return _extract_kie_sync(bucket, key)


def get_raw_kie_pairs(file_key: str) -> dict[str, str]:
    """Return raw Textract KIE key-value pairs without schema matching."""
    bucket = _get_s3_bucket()
    try:
        return _extract_kie(bucket, file_key)
    except Exception:
        logger.warning("Raw KIE extraction failed for %s", file_key, exc_info=True)
        return {}


def _normalize_kie_key(text: str) -> str:
    return text.lower().strip().rstrip(":.,;").strip()


def _word_set(text: str) -> set[str]:
    return {w.strip().lower().strip(":.,;") for w in text.split() if len(w) > 2}


def _match_schema_field_to_kie(
    schema_field: dict,
    kv_pairs: dict[str, str],
) -> dict | None:
    field_key = schema_field.get("key", "")
    field_id = schema_field.get("id", "")

    target_words = _word_set(field_key.replace("_", " "))

    best_match_key: str | None = None
    best_overlap = 0

    for kv_key in kv_pairs:
        kv_words = _word_set(kv_key)
        if not kv_words or not target_words:
            overlap = 1 if (_normalize_kie_key(kv_key) == field_key.replace("_", "")) else 0
        else:
            overlap = len(target_words & kv_words) / len(target_words)

        if overlap > best_overlap:
            best_overlap = overlap
            best_match_key = kv_key

    if best_match_key is not None and best_overlap >= 0.25:
        return {
            "value": kv_pairs[best_match_key],
            "source_key": best_match_key,
            "confidence": round(best_overlap, 2),
            "needs_review": best_overlap < 0.6,
        }
    return {
        "value": "",
        "source_key": None,
        "confidence": 0.0,
        "needs_review": True,
    }


def extract_document_fields(
    file_key: str,
    fields_json: list[dict],
) -> dict[str, dict]:
    """Extract structured field values from a document using Textract KIE.

    Returns a dict keyed by schema field id, each containing the extracted value,
    source key, confidence, and whether it needs review.
    Also includes _raw_kie_pairs with the full raw KIE output.
    """
    bucket = _get_s3_bucket()

    try:
        kv_pairs = _extract_kie(bucket, file_key)
    except (UnsupportedDocumentError, TextractError) as exc:
        logger.warning("KIE extraction failed for %s: %s", file_key, exc)
        return {}

    logger.info(
        "KIE extracted %d key-value pairs from s3://%s/%s",
        len(kv_pairs),
        bucket,
        file_key,
    )

    results: dict[str, dict] = {}
    results["_raw_kie_pairs"] = {
        "value": json.dumps(kv_pairs),
        "source_key": None,
        "confidence": 1.0,
        "needs_review": False,
    }

    for field in fields_json:
        field_id = field.get("id", "")
        if not field_id:
            continue
        result = _match_schema_field_to_kie(field, kv_pairs)
        if result:
            results[field_id] = result

    return results