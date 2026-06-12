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
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "ap-southeast-2"),
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


def _object_key(student_id: str, filename: str) -> str:
    ext = Path(filename).suffix or ".pdf"
    return f"{_staging_prefix()}{student_id}/{uuid.uuid4().hex}{ext}"


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
    client = _get_client()
    try:
        client.delete_object(Bucket=_bucket(), Key=key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"S3 delete failed: {e}",
        )
