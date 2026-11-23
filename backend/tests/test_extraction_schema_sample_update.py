"""Sample handling on update, file-type checks on generate, and the replacement-type guard on confirm.

External calls (storage, classification, identity) and the database are mocked.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import DocumentSubmission, DocumentType, ExtractionSchema, Student, SubmissionStatus
from app.routers.admin import extraction_schemas as es_router
from app.routers.documents import classification as cls_router
from app.schemas.extraction_schemas import ExtractionSchemaUpdateRequest
from app.services import gcp_storage


def _prefix() -> str:
    return gcp_storage._admin_sample_prefix()


def _schema(sample_key):
    return ExtractionSchema(
        id=uuid4(),
        name="Admission",
        status="draft",
        fields_json=[],
        schema_json={},
        sample_file_key=sample_key,
    )


def _db_with_schema(schema):
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)
    db.add = MagicMock()
    empty = MagicMock()
    empty.first.return_value = None  # no other schema uses the sample key
    db.execute = AsyncMock(return_value=empty)
    return db


# ---------- update: the sample key is saved and the old one removed ---------

@pytest.mark.asyncio
async def test_update_saves_a_new_sample_and_deletes_the_replaced_one():
    old_key = f"{_prefix()}old111/form.pdf"
    new_key = f"{_prefix()}new222/form.pdf"
    schema = _schema(old_key)
    db = _db_with_schema(schema)
    payload = ExtractionSchemaUpdateRequest(sample_file_key=new_key)

    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "blob_exists", MagicMock(return_value=True)), \
         patch.object(es_router, "serialize_extraction_schema", MagicMock(return_value="ok")), \
         patch.object(es_router, "delete_file", MagicMock()) as delete:
        result = await es_router.update_extraction_schema(
            schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
        )

    assert result == "ok"
    assert schema.sample_file_key == new_key
    assert schema.sample_content_type == "application/pdf"
    delete.assert_called_once_with(old_key)


@pytest.mark.asyncio
async def test_update_without_a_sample_field_leaves_the_sample_alone():
    old_key = f"{_prefix()}old111/form.pdf"
    schema = _schema(old_key)
    db = _db_with_schema(schema)
    payload = ExtractionSchemaUpdateRequest(name="Renamed")

    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "serialize_extraction_schema", MagicMock(return_value="ok")), \
         patch.object(es_router, "delete_file", MagicMock()) as delete:
        await es_router.update_extraction_schema(
            schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
        )

    assert schema.sample_file_key == old_key
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_update_removes_the_sample_when_null_is_sent():
    old_key = f"{_prefix()}old111/form.pdf"
    schema = _schema(old_key)
    db = _db_with_schema(schema)
    payload = ExtractionSchemaUpdateRequest(sample_file_key=None)

    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "serialize_extraction_schema", MagicMock(return_value="ok")), \
         patch.object(es_router, "delete_file", MagicMock()) as delete:
        await es_router.update_extraction_schema(
            schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
        )

    assert schema.sample_file_key is None
    assert schema.sample_content_type is None
    delete.assert_called_once_with(old_key)


@pytest.mark.asyncio
async def test_update_rejects_a_sample_key_outside_the_prefix():
    schema = _schema(None)
    db = _db_with_schema(schema)
    payload = ExtractionSchemaUpdateRequest(sample_file_key="staging/x/y.pdf")

    with patch.object(es_router, "record_activity", AsyncMock()):
        with pytest.raises(HTTPException) as info:
            await es_router.update_extraction_schema(
                schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 400
    assert schema.sample_file_key is None
    db.commit.assert_not_called()


# ---------- generate: only PDF, PNG and JPEG samples -------------------------

def _upload(filename: str, content_type: str = "text/html"):
    upload = SimpleNamespace(filename=filename, content_type=content_type)
    upload.read = AsyncMock(return_value=b"<html>not a form</html>")
    return upload


def _db_for_generate():
    db = AsyncMock()
    empty = MagicMock()
    empty.scalars.return_value = MagicMock(all=MagicMock(return_value=[]))
    db.execute = AsyncMock(return_value=empty)
    return db


@pytest.mark.asyncio
@pytest.mark.parametrize("filename", ["form.html", "drawing.svg", "script.js", "notes.txt"])
async def test_generate_rejects_file_types_other_than_pdf_png_and_jpeg(filename):
    upload = _upload(filename)
    db = _db_for_generate()

    with patch.object(es_router, "upload_file_bytes", MagicMock()) as upload_bytes:
        with pytest.raises(HTTPException) as info:
            await es_router.generate_extraction_schema(
                files=[upload], prompt=None, current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 400
    upload_bytes.assert_not_called()


@pytest.mark.asyncio
async def test_generate_stores_the_type_from_the_extension_not_the_client_header():
    # The browser claims text/html, but a .png is stored as image/png.
    upload = _upload("scan.png", content_type="text/html")
    upload.read = AsyncMock(return_value=b"\x89PNG fake image bytes")
    db = _db_for_generate()

    with patch.object(es_router, "upload_file_bytes", MagicMock()) as upload_bytes, \
         patch.object(es_router, "delete_file", MagicMock()), \
         patch.object(es_router, "classify_document", MagicMock(return_value={})), \
         patch.object(es_router, "generate_schema_blueprint", MagicMock(return_value={})), \
         patch.object(es_router, "blueprint_to_fields", MagicMock(return_value=({"type": "object", "properties": {}}, []))):
        await es_router.generate_extraction_schema(
            files=[upload], prompt=None, current_user={"sub": "admin"}, db=db
        )

    args = upload_bytes.call_args[0]
    assert args[0].startswith(_prefix())
    assert args[2] == "image/png"


# ---------- confirm: a replacement must keep its type -------------------------

def _student(student_id):
    return Student(id=student_id, user_id=uuid4())


@pytest.mark.asyncio
async def test_confirm_with_a_different_type_keeps_both_files_and_says_so():
    student_id = uuid4()
    replaced_id = uuid4()
    birth_type = uuid4()
    transcript_type = uuid4()

    replaced = SimpleNamespace(
        id=replaced_id,
        student_id=student_id,
        document_type_id=birth_type,
        is_compiled_parent=False,
    )
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student_id,
        status="classified",
        document_type_id=None,
        parent_submission_id=replaced_id,
        classification_result=None,
    )
    doc_type = DocumentType(id=transcript_type, name="Transcript", code="TOR")

    def _get(model, key):
        if model is DocumentSubmission:
            return submission if key == submission.id else replaced
        if model is DocumentType:
            return doc_type
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=_get)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=_student(student_id))))
    db.commit = AsyncMock()

    body = cls_router.ConfirmClassificationRequest(document_type_id=str(transcript_type))

    with patch.object(cls_router, "ensure_user_row", AsyncMock(return_value=SimpleNamespace(id=uuid4()))), \
         patch.object(cls_router, "has_verified_submission", AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as info:
            await cls_router.confirm_classification(
                submission_id=submission.id, body=body, current_user={"sub": "student"}, db=db
            )

    assert info.value.status_code == 409
    assert "both files were kept" in info.value.detail
    # The link to the replaced file is removed, so the original is no longer hidden.
    assert submission.parent_submission_id is None
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_confirm_with_the_same_type_keeps_the_replacement_link():
    student_id = uuid4()
    replaced_id = uuid4()
    birth_type = uuid4()

    replaced = SimpleNamespace(
        id=replaced_id,
        student_id=student_id,
        document_type_id=birth_type,
        is_compiled_parent=False,
    )
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student_id,
        status=SubmissionStatus.CLASSIFIED,
        document_type_id=birth_type,
        parent_submission_id=replaced_id,
        classification_result=None,
        file_key="staging/x/y.pdf",
        original_filename="birth.pdf",
        file_size="10",
        mime_type="application/pdf",
        is_compiled=False,
        document_type=None,
        created_at=None,
    )
    doc_type = DocumentType(id=birth_type, name="Birth certificate", code="BC")

    def _get(model, key):
        if model is DocumentSubmission:
            return submission if key == submission.id else replaced
        if model is DocumentType:
            return doc_type
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=_get)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=_student(student_id))))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    body = cls_router.ConfirmClassificationRequest(document_type_id=str(birth_type))

    with patch.object(cls_router, "ensure_user_row", AsyncMock(return_value=SimpleNamespace(id=uuid4()))), \
         patch.object(cls_router, "has_verified_submission", AsyncMock(return_value=False)), \
         patch.object(cls_router, "SubmissionDetailResponse", MagicMock(return_value="ok")):
        result = await cls_router.confirm_classification(
            submission_id=submission.id, body=body, current_user={"sub": "student"}, db=db
        )

    assert result == "ok"
    assert submission.parent_submission_id == replaced_id
    assert submission.status == SubmissionStatus.CLASSIFIED
