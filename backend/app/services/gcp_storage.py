from __future__ import annotations

import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, status
from google.cloud import storage
from google.cloud.storage.retry import DEFAULT_RETRY

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)

logger = logging.getLogger(__name__)


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{name} is not configured.",
        )
    return value


def _get_client() -> storage.Client:
    return storage.Client(project=_require_env("GOOGLE_CLOUD_PROJECT"))


def _bucket() -> storage.Bucket:
    client = _get_client()
    return client.bucket(_require_env("GCS_BUCKET"))


def _admin_temp_prefix() -> str:
    return os.getenv("GCS_ADMIN_TEMP_PREFIX", "admin-temp/")


def _staging_prefix() -> str:
    return os.getenv("GCS_STAGING_PREFIX", "staging/")


def _production_prefix() -> str:
    return os.getenv("GCS_PRODUCTION_PREFIX", "production/")


MAX_UPLOAD_SIZE_BYTES = 315 * 1024 * 1024


def make_staging_key(student_id: str, filename: str) -> str:
    """Return a unique staging GCS key for a student's document upload."""
    ext = Path(filename).suffix or ".pdf"
    return f"{_staging_prefix()}{student_id}/{uuid.uuid4().hex}{ext}"


def upload_file_bytes(key: str, content: bytes, content_type: str = "application/pdf") -> str:
    """Upload raw bytes to GCS. Returns the key for later operations."""
    bucket = _bucket()
    blob = bucket.blob(key)
    blob.content_type = content_type
    blob.upload_from_string(content, content_type=content_type)
    return key


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    bucket = _bucket()
    blob = bucket.blob(key)
    try:
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expires_in),
            method="GET",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate presigned URL: {e}",
        )


def generate_presigned_post(
    key: str,
    mime_type: str,
    max_size_bytes: int = MAX_UPLOAD_SIZE_BYTES,
    expires_in: int = 3600,
) -> dict:
    bucket = _bucket()
    blob = bucket.blob(key)
    try:
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=expires_in),
            method="PUT",
            content_type=mime_type,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate signed upload URL: {e}",
        )

    return {
        "url": url,
        "fields": {},
        "key": key,
        "bucket": bucket.name,
        "region": "asia-southeast1",
    }


def head_object(key: str) -> dict:
    bucket = _bucket()
    blob = bucket.blob(key)
    try:
        blob.reload()
        return {
            "size": blob.size,
            "content_type": blob.content_type,
            "updated": blob.updated.isoformat() if blob.updated else None,
            "etag": blob.etag,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to verify object in GCS: {e}",
        )


def move_to_production(key: str) -> str:
    bucket = _bucket()
    production_key = key.replace(_staging_prefix(), _production_prefix(), 1)
    try:
        source_blob = bucket.blob(key)
        bucket.copy_blob(
            source_blob,
            bucket,
            production_key,
        )
        dest_blob = bucket.blob(production_key)
        if not dest_blob.exists():
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Move to production failed: destination object not found after copy.",
            )
        source_blob.delete()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GCS move to production failed: {e}",
        )
    return production_key


def delete_file(key: str) -> None:
    bucket = _bucket()
    blob = bucket.blob(key)
    try:
        blob.delete()
    except Exception:
        logger.exception("Failed to delete GCS file: %s", key)


def ensure_bucket_cors() -> None:
    """Set CORS policy on the bucket for browser-based uploads.

    Reads allowed origins from GCS_CORS_ORIGINS (comma-separated).
    Defaults to localhost:5173 for development.
    """
    bucket = _bucket()
    origins = os.getenv("GCS_CORS_ORIGINS", "http://localhost:5173").split(",")
    bucket.cors = [
        {
            "origin": [o.strip() for o in origins],
            "method": ["GET", "PUT", "POST", "HEAD"],
            "responseHeader": ["*"],
            "maxAgeSeconds": 3600,
        }
    ]
    bucket.update()


def move_to_production_batch(keys: list[str]) -> list[str]:
    """Move multiple files from staging to production in parallel."""
    results: list[str] = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        fut_map = {ex.submit(move_to_production, k): k for k in keys}
        for fut in as_completed(fut_map):
            results.append(fut.result())
    return results
