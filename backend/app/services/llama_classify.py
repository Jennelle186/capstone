from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx
from fastapi import HTTPException, status

from ..services.llama_extract import get_llama_cloud_api_key

LLAMA_CLOUD_BASE_URL = "https://api.cloud.llamaindex.ai"


class LlamaClassifyError(Exception):
    """Raised when a LlamaCloud classify or parse operation fails."""


class LlamaTimeoutError(Exception):
    """Raised when polling for a LlamaCloud job exceeds the max wait time."""


class LlamaNoCreditsError(Exception):
    """Raised when the LlamaCloud account is out of credits."""


def _get_project_id() -> str | None:
    return os.getenv("LLAMA_CLOUD_PROJECT_ID", "").strip() or None


def _query_params() -> dict[str, str]:
    project_id = _get_project_id()
    return {"project_id": project_id} if project_id else {}


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_llama_cloud_api_key()}",
        "Accept": "application/json",
    }


logger = logging.getLogger(__name__)


async def upload_file(file_url: str, original_filename: str, mime_type: str) -> str:
    """Download a file from a presigned S3 URL and upload it to LlamaCloud.

    Returns the LlamaCloud file_id, which is used for classify/extract jobs.
    """
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        download = await client.get(file_url)
        if download.is_error:
            raise LlamaClassifyError(f"Failed to download file from S3: {download.status_code}")
        content = download.content

        if not content:
            raise LlamaClassifyError("Downloaded file is empty")

        # The LlamaCloud Files v1 endpoint expects the multipart field to be
        # named "upload_file", not "file".
        files = {
            "upload_file": (
                original_filename or "document.pdf",
                content,
                mime_type or "application/octet-stream",
            ),
        }
        data = {"purpose": "parse"}

        upload = await client.post(
            f"{LLAMA_CLOUD_BASE_URL}/api/v1/files",
            headers={"Authorization": f"Bearer {get_llama_cloud_api_key()}"},
            params=_query_params(),
            files=files,
            data=data,
        )

    logger.debug("LlamaCloud file upload status=%s body=%s", upload.status_code, upload.text)
    if upload.status_code == 402:
        raise LlamaNoCreditsError("LlamaCloud credits exhausted")
    if upload.is_error:
        raise LlamaClassifyError(f"LlamaCloud file upload failed: {upload.status_code} {upload.text}")

    payload = upload.json()
    file_id = payload.get("id")
    if not file_id:
        raise LlamaClassifyError("LlamaCloud file upload did not return a file_id")
    return file_id


async def parse_document(
    file_id: str,
    tier: str = "cost_effective",
    max_wait_seconds: int = 300,
) -> dict[str, Any]:
    """Parse a LlamaCloud file and return the extracted markdown/text.

    Uses the v2 Parse API. Polls until the job completes or fails.
    """
    async with httpx.AsyncClient(timeout=120) as client:
        create = await client.post(
            f"{LLAMA_CLOUD_BASE_URL}/api/v2/parse",
            headers={**_headers(), "Content-Type": "application/json"},
            params=_query_params(),
            json={"file_id": file_id, "tier": tier, "version": "latest"},
        )

    if create.status_code == 402:
        raise LlamaNoCreditsError("LlamaCloud credits exhausted")
    if create.is_error:
        raise LlamaClassifyError(f"Parse job creation failed: {create.status_code} {create.text}")

    job = create.json()
    job_id = job.get("id")
    if not job_id:
        raise LlamaClassifyError("Parse job creation did not return a job_id")

    elapsed = 0.0
    sleep = 2.0
    while elapsed < max_wait_seconds:
        async with httpx.AsyncClient(timeout=60) as client:
            result = await client.get(
                f"{LLAMA_CLOUD_BASE_URL}/api/v2/parse/{job_id}",
                headers=_headers(),
                params={**_query_params(), "expand": "markdown_full"},
            )

        if result.is_error:
            raise LlamaClassifyError(f"Parse job polling failed: {result.status_code} {result.text}")

        data = result.json()
        job_status = data.get("status", "").upper()

        if job_status == "FAILED":
            error_message = data.get("error_message") or data.get("error", "unknown")
            raise LlamaClassifyError(f"Parse job failed: {error_message}")

        if job_status == "COMPLETED":
            return data

        await asyncio.sleep(sleep)
        elapsed += sleep
        sleep = min(sleep * 1.5, 15.0)

    raise LlamaTimeoutError(f"Parse job did not complete within {max_wait_seconds}s")


async def classify_document(
    file_id: str,
    rules: list[dict[str, str]],
    mode: str = "FAST",
    max_wait_seconds: int = 300,
) -> dict[str, Any]:
    """Classify a LlamaCloud file against the given rules using the v2 API.

    Returns the v2 classify job response with type, confidence, and reasoning
    in the top-level `result` field.
    """
    if not rules:
        raise LlamaClassifyError("No classification rules provided")

    async with httpx.AsyncClient(timeout=120) as client:
        create = await client.post(
            f"{LLAMA_CLOUD_BASE_URL}/api/v2/classify",
            headers={**_headers(), "Content-Type": "application/json"},
            params=_query_params(),
            json={
                "file_input": file_id,
                "configuration": {
                    "rules": rules,
                    "mode": mode,
                },
            },
        )

    logger.debug("LlamaCloud classify create status=%s body=%s", create.status_code, create.text)
    if create.status_code == 402:
        raise LlamaNoCreditsError("LlamaCloud credits exhausted")
    if create.is_error:
        raise LlamaClassifyError(f"Classify job creation failed: {create.status_code} {create.text}")

    job = create.json()
    job_id = job.get("id")
    if not job_id:
        raise LlamaClassifyError("Classify job creation did not return a job_id")

    elapsed = 0.0
    sleep = 2.0
    while elapsed < max_wait_seconds:
        async with httpx.AsyncClient(timeout=60) as client:
            result = await client.get(
                f"{LLAMA_CLOUD_BASE_URL}/api/v2/classify/{job_id}",
                headers=_headers(),
                params=_query_params(),
            )

        if result.is_error:
            raise LlamaClassifyError(f"Classify job polling failed: {result.status_code} {result.text}")

        data = result.json()
        logger.debug("LlamaCloud classify poll status body=%s", data)
        job_status = data.get("status", "").upper()

        if job_status == "FAILED":
            error_message = data.get("error_message") or data.get("error", "unknown")
            raise LlamaClassifyError(f"Classify job failed: {error_message}")

        if job_status == "COMPLETED":
            logger.info("LlamaCloud classify job completed for file_id=%s", file_id)
            return data

        await asyncio.sleep(sleep)
        elapsed += sleep
        sleep = min(sleep * 1.5, 15.0)

    raise LlamaTimeoutError(f"Classify job did not complete within {max_wait_seconds}s")


def extract_classification_result(classify_response: dict[str, Any]) -> dict[str, Any] | None:
    """Pull the classification result out of a v2 classify job response.

    The v2 API returns the result in the top-level `result` object, unlike the
    older v1 API which nested it under `items[0].result`.
    """
    result = classify_response.get("result")
    if not isinstance(result, dict):
        return None

    return {
        "type": result.get("type"),
        "confidence": result.get("confidence", 0.0),
        "reasoning": result.get("reasoning", ""),
    }


def extract_markdown(parse_response: dict[str, Any]) -> str:
    """Return the full markdown text from a completed parse job response."""
    if not isinstance(parse_response, dict):
        return ""

    # Prefer the full concatenated markdown string.
    full = parse_response.get("markdown_full")
    if isinstance(full, str):
        return full

    # Fall back to per-page markdown.
    pages = parse_response.get("pages") or []
    if isinstance(pages, list):
        parts = []
        for page in pages:
            if isinstance(page, dict):
                md = page.get("markdown")
                if isinstance(md, str):
                    parts.append(md)
        return "\n\n".join(parts)

    return ""
