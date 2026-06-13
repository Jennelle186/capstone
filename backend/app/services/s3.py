from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import BinaryIO

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from fastapi import HTTPException, status

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{name} is not configured.",
        )
    return value


def _get_client():
    region = os.getenv("AWS_REGION", "ap-southeast-2")
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=f"https://s3.{region}.amazonaws.com",
        aws_access_key_id=_require_env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=_require_env("AWS_SECRET_ACCESS_KEY"),
        config=Config(max_pool_connections=50, connect_timeout=10, read_timeout=30),
    )


def _bucket() -> str:
    return _require_env("S3_BUCKET")


def _staging_prefix() -> str:
    return os.getenv("S3_STAGING_PREFIX", "staging/")


def _production_prefix() -> str:
    return os.getenv("S3_PRODUCTION_PREFIX", "production/")


# Maximum upload size enforced by S3 presigned POST policy (315 MB).
# Keep in sync with the frontend upload limit.
MAX_UPLOAD_SIZE_BYTES = 315 * 1024 * 1024


def make_staging_key(student_id: str, filename: str) -> str:
    """Return a unique staging S3 key for a student's document upload."""
    ext = Path(filename).suffix or ".pdf"
    return f"{_staging_prefix()}{student_id}/{uuid.uuid4().hex}{ext}"


# Keep the private alias for backwards compatibility with existing code.
_object_key = make_staging_key


def upload_file(file: BinaryIO, student_id: str, filename: str) -> dict:
    key = _object_key(student_id, filename)
    client = _get_client()
    try:
        client.upload_fileobj(file, _bucket(), key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 upload failed: {e}",
        )
    return {
        "key": key,
        "bucket": _bucket(),
        "region": os.getenv("AWS_REGION", "ap-southeast-2"),
    }


def generate_presigned_url(key: str, expires_in: int = 3600) -> str:
    client = _get_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": key},
            ExpiresIn=expires_in,
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
    """Generate a presigned POST URL so the browser can upload directly to S3.

    The returned policy enforces the object key, Content-Type, and a maximum
    file size. The browser must POST the file along with the returned fields.
    """
    client = _get_client()
    bucket = _bucket()
    fields = {"Content-Type": mime_type} if mime_type else {}
    conditions = [
        ["content-length-range", 1, max_size_bytes],
    ]
    if mime_type:
        conditions.append(["eq", "$Content-Type", mime_type])

    try:
        post = client.generate_presigned_post(
            Bucket=bucket,
            Key=key,
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=expires_in,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate presigned POST URL: {e}",
        )

    return {
        "url": post["url"],
        "fields": post["fields"],
        "key": key,
        "bucket": bucket,
        "region": os.getenv("AWS_REGION", "ap-southeast-2"),
    }


def head_object(key: str) -> dict:
    """Return S3 object metadata for the given key."""
    client = _get_client()
    try:
        return client.head_object(Bucket=_bucket(), Key=key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to verify object in S3: {e}",
        )


def move_to_production(key: str) -> str:
    client = _get_client()
    bucket = _bucket()
    production_key = key.replace(_staging_prefix(), _production_prefix(), 1)
    try:
        client.copy_object(
            Bucket=bucket,
            CopySource={"Bucket": bucket, "Key": key},
            Key=production_key,
        )
        client.delete_object(Bucket=bucket, Key=key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 move to production failed: {e}",
        )
    return production_key


def delete_file(key: str) -> None:
    """Delete an object from S3. Missing objects are treated as successfully deleted."""
    client = _get_client()
    try:
        client.delete_object(Bucket=_bucket(), Key=key)
    except client.exceptions.NoSuchKey:
        # Object did not exist; this is acceptable for abandoned PENDING uploads.
        return
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 delete failed: {e}",
        )
