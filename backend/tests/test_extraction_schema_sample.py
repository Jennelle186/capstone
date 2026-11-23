"""Blank sample forms kept with an extraction schema, so the registry can preview them.

Covers the key check, the create endpoint's rejection of keys outside the sample
prefix, the admin-only preview link, and the generate endpoint keeping the sample
on success while deleting it on failure. External calls are mocked.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import ExtractionSchema
from app.routers.admin import extraction_schemas as es_router
from app.schemas.extraction_schemas import ExtractionSchemaCreateRequest
from app.services import gcp_storage
from app.services.gcp_pipeline import GcpPipelineError


def _prefix() -> str:
    return gcp_storage._admin_sample_prefix()


def _db_for_get(schema):
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)
    return db


def _db_for_generate():
    """Document-type lookup returns nothing, so no inheritance or matching runs."""
    db = AsyncMock()
    empty = MagicMock()
    empty.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
    empty.first.return_value = None  # no other schema uses this sample key
    db.execute = AsyncMock(return_value=empty)
    return db


# ---------- key check -------------------------------------------------------

def test_sample_key_inside_prefix_is_accepted():
    assert gcp_storage.is_admin_sample_key(f"{_prefix()}abc123/form.pdf")


@pytest.mark.parametrize(
    "key",
    [
        None,
        "",
        "staging/abc/file.pdf",
        "production/abc/file.pdf",
        "admin-temp/abc/file.pdf",
        f"{_prefix()}../staging/file.pdf",
        f"{_prefix()}abc/",
    ],
)
def test_keys_outside_the_sample_prefix_are_rejected(key):
    assert gcp_storage.is_admin_sample_key(key) is False


def test_admin_sample_key_is_built_under_the_prefix():
    key = gcp_storage.admin_sample_key("admission form.pdf")
    assert key.startswith(_prefix())
    assert key.endswith("/admission form.pdf")
    assert gcp_storage.is_admin_sample_key(key)


def test_admin_sample_key_strips_directory_parts_from_the_filename():
    key = gcp_storage.admin_sample_key("../../secret/evil.pdf")
    assert ".." not in key
    assert key.endswith("/evil.pdf")


# ---------- create endpoint -------------------------------------------------

@pytest.mark.asyncio
async def test_create_rejects_a_sample_key_outside_the_prefix():
    payload = ExtractionSchemaCreateRequest(name="Admission", sample_file_key="staging/x/y.pdf")
    db = _db_for_get(None)

    with patch.object(es_router, "record_activity", AsyncMock()):
        with pytest.raises(HTTPException) as info:
            await es_router.create_extraction_schema(
                payload=payload, current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 400
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_stores_the_sample_key_and_content_type():
    key = f"{_prefix()}abc123/admission.pdf"
    payload = ExtractionSchemaCreateRequest(name="Admission", sample_file_key=key)
    db = _db_for_generate()
    db.add = MagicMock()
    db.flush = AsyncMock(side_effect=lambda: None)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "blob_exists", MagicMock(return_value=True)), \
         patch.object(es_router, "serialize_extraction_schema", MagicMock(return_value="ok")):
        result = await es_router.create_extraction_schema(
            payload=payload, current_user={"sub": "admin"}, db=db
        )

    saved = db.add.call_args[0][0]
    assert isinstance(saved, ExtractionSchema)
    assert saved.sample_file_key == key
    assert saved.sample_content_type == "application/pdf"
    assert result == "ok"


# ---------- preview link ----------------------------------------------------

@pytest.mark.asyncio
async def test_sample_url_is_404_when_no_sample_was_kept():
    schema = ExtractionSchema(name="Old schema", sample_file_key=None)
    db = _db_for_get(schema)

    with pytest.raises(HTTPException) as info:
        await es_router.get_extraction_schema_sample_url(
            schema_id=uuid4(), current_user={"sub": "admin"}, db=db
        )

    assert info.value.status_code == 404


@pytest.mark.asyncio
async def test_sample_url_is_404_for_a_key_outside_the_prefix():
    schema = ExtractionSchema(name="Bad schema", sample_file_key="staging/x/y.pdf")
    db = _db_for_get(schema)

    with pytest.raises(HTTPException) as info:
        await es_router.get_extraction_schema_sample_url(
            schema_id=uuid4(), current_user={"sub": "admin"}, db=db
        )

    assert info.value.status_code == 404


@pytest.mark.asyncio
async def test_sample_url_returns_a_short_lived_link():
    key = f"{_prefix()}abc123/admission.pdf"
    schema = ExtractionSchema(name="Admission", sample_file_key=key)
    db = _db_for_get(schema)

    with patch.object(es_router, "blob_exists", MagicMock(return_value=True)), \
         patch.object(es_router, "generate_presigned_url", MagicMock(return_value="https://signed.example/x")) as presign:
        response = await es_router.get_extraction_schema_sample_url(
            schema_id=uuid4(), current_user={"sub": "admin"}, db=db
        )

    presign.assert_called_once_with(key, es_router.SAMPLE_URL_EXPIRES_IN)
    assert response.url == "https://signed.example/x"
    assert response.expires_in == es_router.SAMPLE_URL_EXPIRES_IN


# ---------- generate endpoint -----------------------------------------------

def _fake_upload(content: bytes = b"%PDF-1.4 blank form", filename: str = "admission.pdf"):
    upload = SimpleNamespace(filename=filename, content_type="application/pdf")
    upload.read = AsyncMock(return_value=content)
    return upload


@pytest.mark.asyncio
async def test_generate_keeps_the_sample_when_generation_succeeds():
    upload = _fake_upload()
    db = _db_for_generate()

    with patch.object(es_router, "upload_file_bytes", MagicMock()) as upload_bytes, \
         patch.object(es_router, "delete_file", MagicMock()) as delete, \
         patch.object(es_router, "classify_document", MagicMock(return_value={})), \
         patch.object(es_router, "generate_schema_blueprint", MagicMock(return_value={})), \
         patch.object(es_router, "blueprint_to_fields", MagicMock(return_value=({"type": "object", "properties": {}}, []))):
        response = await es_router.generate_extraction_schema(
            files=[upload], prompt=None, current_user={"sub": "admin"}, db=db
        )

    stored_key = upload_bytes.call_args[0][0]
    assert stored_key.startswith(_prefix())
    assert response.file_id == stored_key
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_generate_deletes_the_upload_when_generation_fails():
    upload = _fake_upload()
    db = _db_for_generate()

    with patch.object(es_router, "upload_file_bytes", MagicMock()), \
         patch.object(es_router, "delete_file", MagicMock()) as delete, \
         patch.object(es_router, "classify_document", MagicMock(return_value={})), \
         patch.object(es_router, "generate_schema_blueprint", MagicMock(side_effect=GcpPipelineError("model failed"))):
        with pytest.raises(HTTPException):
            await es_router.generate_extraction_schema(
                files=[upload], prompt=None, current_user={"sub": "admin"}, db=db
            )

    delete.assert_called_once()
    assert delete.call_args[0][0].startswith(_prefix())



@pytest.mark.asyncio
async def test_create_refuses_a_sample_whose_file_is_gone():
    key = f"{_prefix()}gone999/admission.pdf"
    payload = ExtractionSchemaCreateRequest(name="Admission", sample_file_key=key)
    db = _db_for_generate()
    db.add = MagicMock()

    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "blob_exists", MagicMock(return_value=False)):
        with pytest.raises(HTTPException) as info:
            await es_router.create_extraction_schema(payload=payload, current_user={"sub": "admin"}, db=db)

    assert info.value.status_code == 409
    assert "no longer stored" in info.value.detail
    db.add.assert_not_called()

def test_an_empty_sample_prefix_setting_falls_back_to_the_default(monkeypatch):
    monkeypatch.setenv("GCS_ADMIN_SAMPLE_PREFIX", "")
    assert gcp_storage._admin_sample_prefix() == "admin-samples/"
    assert gcp_storage.is_admin_sample_key("staging/student/doc.pdf") is False
