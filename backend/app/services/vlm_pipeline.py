"""Hybrid VLM document processing pipeline.

This service replaces the LlamaCloud-based pipeline. It uses:
1. ibm/granite-docling (via Ollama) for OCR and document structure
2. qwen2.5:3b (via Ollama) for classification and field extraction
3. qwen3-vl:2b as an optional vision fallback for low-confidence classifications
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
from pathlib import Path
from typing import Any

import ollama
from PIL import Image
from pypdfium2 import PdfDocument

from .document_normalizer import normalize_classification_result

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OCR_MODEL = "ibm/granite-docling"
CLASSIFY_MODEL = "qwen2.5:3b"
VLM_FALLBACK_MODEL = "qwen3-vl:2b"

PDF_RENDER_DPI = 200
VLM_MAX_DIMENSION = 1536
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.60

# Default concurrency limit (5 concurrent users per requirement).
DEFAULT_MAX_CONCURRENT = 5

# Admission form schema mirrors the expected frontend fields.
ADMISSION_FORM_SCHEMA = {
    "last_name": "...",
    "first_name": "...",
    "middle_name": "...",
    "birth_date": "...",
    "birth_place": "...",
    "nationality": "...",
    "religion": "...",
    "gender": "...",
    "home_address": "...",
    "city_address": "...",
    "contact_number": "...",
    "email": "...",
    "guardian_name": "...",
    "guardian_contact": "...",
    "last_school_attended": "...",
}

# Lazy semaphore shared across pipeline calls.
_pipeline_semaphore: asyncio.Semaphore | None = None


def _get_semaphore(max_concurrent: int = DEFAULT_MAX_CONCURRENT) -> asyncio.Semaphore:
    global _pipeline_semaphore
    if _pipeline_semaphore is None:
        _pipeline_semaphore = asyncio.Semaphore(max_concurrent)
    return _pipeline_semaphore


def _safe_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", name).strip("_")


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)


# ---------------------------------------------------------------------------
# PDF / Image Helpers
# ---------------------------------------------------------------------------


def pdf_to_images(pdf_path: Path, dpi: int = PDF_RENDER_DPI) -> list[Image.Image]:
    """Convert a PDF file to a list of RGB PIL Images."""
    pdf = PdfDocument(str(pdf_path))
    images: list[Image.Image] = []
    try:
        for page in pdf:
            bitmap = page.render(scale=dpi / 72.0)
            pil_image = bitmap.to_pil()
            if pil_image.mode != "RGB":
                pil_image = pil_image.convert("RGB")
            images.append(pil_image)
    finally:
        pdf.close()
    return images


def resize_for_vlm(image: Image.Image, max_dim: int = VLM_MAX_DIMENSION) -> Image.Image:
    """Resize image so the longest side is <= max_dim."""
    width, height = image.size
    if max(width, height) <= max_dim:
        return image
    scale = max_dim / max(width, height)
    new_size = (int(width * scale), int(height * scale))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def image_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """Encode a PIL image to a base64 string for the Ollama API."""
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


# ---------------------------------------------------------------------------
# Ollama Helpers
# ---------------------------------------------------------------------------


def _parse_json_response(text: str) -> dict[str, Any]:
    """Extract the first JSON object from a model response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse JSON response: %s", exc)
        return {"raw_response": text}


def _ollama_call(
    prompt: str,
    model: str,
    images: list[str] | None = None,
    num_ctx: int = 4096,
) -> tuple[str, int]:
    """Call Ollama and return (content, elapsed_ms).

    This is a synchronous wrapper. Use it inside asyncio.to_thread in async code.
    """
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": prompt},
    ]
    if images:
        messages[0]["images"] = images

    start = _now_ms()
    response = ollama.chat(
        model=model,
        messages=messages,
        options={"num_ctx": num_ctx},
    )
    elapsed_ms = _now_ms() - start
    return response.message.content, elapsed_ms


async def _call_ollama_async(
    prompt: str,
    model: str,
    images: list[str] | None = None,
    num_ctx: int = 4096,
) -> tuple[str, int]:
    """Async wrapper around _ollama_call (runs in thread pool)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: _ollama_call(prompt, model, images, num_ctx),
    )


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


def _classification_prompt(types_csv: str) -> str:
    return (
        f"You are a document classifier for a school enrolment system. "
        f"Classify the document as EXACTLY one of: {types_csv}.\n"
        "Important mapping hints:\n"
        "- 'Certificate of Live Birth' -> BIRTH_CERT\n"
        "- 'Form 138' or transcript of records -> REPORT_CARD\n"
        "- 'Good Moral Character' certificate -> GOOD_MORAL\n"
        "- College entrance test results -> CET\n\n"
        "Return a JSON object with these keys:\n"
        "- type: the exact enum value\n"
        "- confidence: a number from 0.0 to 1.0\n"
        "- reasoning: one sentence explaining why\n"
        "- alternatives: an array of up to 2 alternative types with confidence scores\n\n"
        "Return ONLY valid JSON."
    )


def _vlm_classification_prompt(types_csv: str) -> str:
    return (
        f"You are a document classifier for a school enrolment system. "
        f"Look at the provided document image and classify it as EXACTLY one of: {types_csv}.\n"
        "Return a JSON object with keys: type, confidence (0.0-1.0), reasoning, alternatives. "
        "Return ONLY valid JSON."
    )


def _extraction_prompt(doc_type: str) -> str:
    if doc_type == "ADMISSION_FORM":
        schema_json = json.dumps(ADMISSION_FORM_SCHEMA, indent=2)
        return (
            "You are extracting fields from a school admission form text. "
            "Return a JSON object containing every field you can read. "
            "If a field is not present or unreadable, use null.\n\n"
            f"Expected fields:\n{schema_json}\n\n"
            "Return ONLY valid JSON."
        )
    return (
        f"Extract all key information from this {doc_type} text as JSON. "
        "Return ONLY valid JSON."
    )


# ---------------------------------------------------------------------------
# Core Pipeline Stages
# ---------------------------------------------------------------------------


async def _ocr_with_granite_docling(image: Image.Image) -> tuple[str, int]:
    """OCR a document image using ibm/granite-docling."""
    resized = resize_for_vlm(image)
    image_b64 = image_to_base64(resized, "JPEG")
    prompt = (
        "Convert this document page to clean, structured text. "
        "Preserve headings, labels, and tables. Output plain text only."
    )
    return await _call_ollama_async(prompt, OCR_MODEL, images=[image_b64])


async def _classify_with_text_llm(ocr_text: str) -> tuple[dict[str, Any], int]:
    """Classify OCR text using qwen2.5:3b."""
    types_csv = ", ".join(sorted(["ADMISSION_FORM", "BIRTH_CERT", "REPORT_CARD", "CET", "GOOD_MORAL", "OTHERS"]))
    prompt = _classification_prompt(types_csv) + f"\n\nDocument text:\n{ocr_text[:4000]}\n\nReturn ONLY valid JSON."
    content, elapsed_ms = await _call_ollama_async(prompt, CLASSIFY_MODEL)
    parsed = _parse_json_response(content)
    return normalize_classification_result(parsed), elapsed_ms


async def _classify_with_vlm(image: Image.Image) -> tuple[dict[str, Any], int]:
    """Classify a document image directly with qwen3-vl:2b."""
    resized = resize_for_vlm(image)
    image_b64 = image_to_base64(resized, "JPEG")
    types_csv = ", ".join(sorted(["ADMISSION_FORM", "BIRTH_CERT", "REPORT_CARD", "CET", "GOOD_MORAL", "OTHERS"]))
    prompt = _vlm_classification_prompt(types_csv)
    content, elapsed_ms = await _call_ollama_async(prompt, VLM_FALLBACK_MODEL, images=[image_b64])
    parsed = _parse_json_response(content)
    return normalize_classification_result(parsed), elapsed_ms


async def _extract_with_text_llm(ocr_text: str, doc_type: str) -> tuple[dict[str, Any], int]:
    """Extract fields from OCR text using qwen2.5:3b."""
    prompt = _extraction_prompt(doc_type) + f"\n\nDocument text:\n{ocr_text[:6000]}\n\nReturn ONLY valid JSON."
    content, elapsed_ms = await _call_ollama_async(prompt, CLASSIFY_MODEL)
    parsed = _parse_json_response(content)
    return parsed, elapsed_ms


# ---------------------------------------------------------------------------
# Page Classification & Compiled Detection
# ---------------------------------------------------------------------------


async def _classify_page(
    image: Image.Image,
    use_vlm: bool = False,
) -> dict[str, Any]:
    """Classify a single page."""
    if use_vlm:
        result, elapsed_ms = await _classify_with_vlm(image)
        return {
            "result": result,
            "elapsed_ms": elapsed_ms,
            "mode": "vlm",
        }

    ocr_text, ocr_elapsed_ms = await _ocr_with_granite_docling(image)
    result, classify_elapsed_ms = await _classify_with_text_llm(ocr_text)
    return {
        "result": result,
        "ocr_text": ocr_text,
        "ocr_elapsed_ms": ocr_elapsed_ms,
        "classify_elapsed_ms": classify_elapsed_ms,
        "mode": "hybrid",
    }


def _detect_compiled_document(
    page_classifications: list[dict[str, Any]],
) -> tuple[bool, list[dict[str, Any]]]:
    """Detect whether pages in a PDF belong to different document types."""
    types = [pc["result"].get("type", "OTHERS") for pc in page_classifications]
    if not types:
        return False, []

    is_compiled = len(set(types)) > 1
    sections: list[dict[str, Any]] = []
    current_type = types[0]
    start_page = 1
    for idx, doc_type in enumerate(types[1:], start=2):
        if doc_type != current_type:
            sections.append(
                {
                    "page_range": f"{start_page}-{idx - 1}",
                    "detected_type": current_type,
                    "confidence": page_classifications[start_page - 1]["result"].get("confidence", 0.0),
                }
            )
            current_type = doc_type
            start_page = idx
    sections.append(
        {
            "page_range": f"{start_page}-{len(types)}",
            "detected_type": current_type,
            "confidence": page_classifications[start_page - 1]["result"].get("confidence", 0.0),
        }
    )
    return is_compiled, sections


# ---------------------------------------------------------------------------
# Public Pipeline
# ---------------------------------------------------------------------------


async def process_document(
    file_path: Path,
    skip_extraction: bool = False,
    max_concurrent: int = DEFAULT_MAX_CONCURRENT,
) -> dict[str, Any]:
    """Process a single document through the hybrid VLM pipeline.

    Args:
        file_path: Path to the PDF/image file.
        skip_extraction: If True, skip field extraction.
        max_concurrent: Concurrency limit for this pipeline instance.

    Returns:
        A dict with classification, extraction, timing, and compiled detection info.
    """
    overall_start = _now_ms()
    result: dict[str, Any] = {
        "file": file_path.name,
        "file_size_bytes": file_path.stat().st_size,
    }

    semaphore = _get_semaphore(max_concurrent)
    async with semaphore:
        images = pdf_to_images(file_path)
        result["page_count"] = len(images)

        # Determine whether to classify all pages.
        # For now: classify all pages if >1 page OR filename suggests compiled.
        classify_all_pages = file_path.name.lower().startswith("compiled") or len(images) > 1

        page_classifications: list[dict[str, Any]] = []
        if classify_all_pages:
            for page_idx, page_image in enumerate(images):
                page_result = await _classify_page(page_image)
                page_classifications.append({"page": page_idx + 1, **page_result})

            is_compiled, sections = _detect_compiled_document(page_classifications)
            result["compiled_detection"] = {
                "is_compiled": is_compiled,
                "sections": sections,
                "page_classifications": page_classifications,
            }

            primary = page_classifications[0]
            result["classification"] = primary["result"]
            result["classification_mode"] = primary["mode"]
            ocr_text = primary.get("ocr_text", "")
        else:
            page_result = await _classify_page(images[0])
            result["classification"] = page_result["result"]
            result["classification_mode"] = page_result["mode"]
            result["compiled_detection"] = {"is_compiled": False, "sections": []}
            ocr_text = page_result.get("ocr_text", "")

        # VLM fallback if confidence is low.
        if result["classification"].get("confidence", 0.0) < CLASSIFICATION_CONFIDENCE_THRESHOLD:
            logger.warning(
                "Low classification confidence (%.2f); retrying with VLM fallback",
                result["classification"].get("confidence", 0.0),
            )
            fallback_result, fallback_elapsed_ms = await _classify_with_vlm(images[0])
            result["classification_fallback"] = {
                "result": fallback_result,
                "elapsed_ms": fallback_elapsed_ms,
            }
            if fallback_result.get("confidence", 0.0) > result["classification"].get("confidence", 0.0):
                result["classification"] = fallback_result
                result["classification_mode"] = "vlm_fallback"

        # Field extraction (only admission forms unless requested).
        doc_type = result["classification"].get("type", "OTHERS")
        is_admission = doc_type == "ADMISSION_FORM" or "admission" in file_path.name.lower()
        if not skip_extraction and is_admission:
            # For multi-page admission forms, combine OCR text from all pages.
            if classify_all_pages:
                ocr_text = "\n\n".join(
                    pc.get("ocr_text", "") for pc in page_classifications
                )
            extracted, extract_elapsed_ms = await _extract_with_text_llm(ocr_text, doc_type)
            result["extraction"] = {
                "result": extracted,
                "elapsed_ms": extract_elapsed_ms,
            }

    result["total_elapsed_ms"] = _now_ms() - overall_start
    return result


# Synchronous wrapper for non-async callers.
def process_document_sync(
    file_path: Path,
    skip_extraction: bool = False,
    max_concurrent: int = DEFAULT_MAX_CONCURRENT,
) -> dict[str, Any]:
    return asyncio.run(
        process_document(file_path, skip_extraction, max_concurrent)
    )
