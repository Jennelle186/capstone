"""Samples shared between schemas, a missing sample file, and the replacement-type guard order.

Storage and the database are mocked.
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
from app.schemas.extraction_schemas import ExtractionSchemaCreateRequest, ExtractionSchemaUpdateRequest
from app.services import gcp_storage


def _prefix() -> str:
    return gcp_storage._admin_sample_prefix()


def _db_sharing(used_by_other: bool):
    """A database where the sample-key lookup finds (or does not find) another schema."""
    result = MagicMock()
    result.first.return_value = (uuid4(),) if used_by_other else None
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    return db


# ---------- a sample cannot be shared between schemas -----------------------

@pytest.mark.asyncio
async def test_create_refuses_a_sample_another_schema_already_uses():
    payload = ExtractionSchemaCreateRequest(name="Second", sample_file_key=f"{_prefix()}shared/form.pdf")
    db = _db_sharing(used_by_other=True)

    with patch.object(es_router, "record_activity", AsyncMock()):
        with pytest.raises(HTTPException) as info:
            await es_router.create_extraction_schema(payload=payload, current_user={"sub": "admin"}, db=db)

    assert info.value.status_code == 409
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_update_refuses_to_switch_to_a_sample_another_schema_uses():
    schema = ExtractionSchema(id=uuid4(), name="A", status="draft", fields_json=[], schema_json={}, sample_file_key=None)
    db = _db_sharing(used_by_other=True)
    db.get = AsyncMock(return_value=schema)
    payload = ExtractionSchemaUpdateRequest(sample_file_key=f"{_prefix()}shared/form.pdf")

    with patch.object(es_router, "record_activity", AsyncMock()):
        with pytest.raises(HTTPException) as info:
            await es_router.update_extraction_schema(
                schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 409
    assert schema.sample_file_key is None


@pytest.mark.asyncio
async def test_update_keeps_the_old_sample_while_another_schema_still_uses_it():
    old_key = f"{_prefix()}old/form.pdf"
    new_key = f"{_prefix()}new/form.pdf"
    schema = ExtractionSchema(id=uuid4(), name="A", status="draft", fields_json=[], schema_json={}, sample_file_key=old_key)
    db = _db_sharing(used_by_other=False)
    db.get = AsyncMock(return_value=schema)

    # The first lookup (is the new key free?) finds nothing; the second (is the old key still used?) finds a schema.
    results = [MagicMock(first=MagicMock(return_value=None)), MagicMock(first=MagicMock(return_value=(uuid4(),)))]
    db.execute = AsyncMock(side_effect=results)

    payload = ExtractionSchemaUpdateRequest(sample_file_key=new_key)
    with patch.object(es_router, "record_activity", AsyncMock()), \
         patch.object(es_router, "blob_exists", MagicMock(return_value=True)), \
         patch.object(es_router, "serialize_extraction_schema", MagicMock(return_value="ok")), \
         patch.object(es_router, "delete_file", MagicMock()) as delete:
        await es_router.update_extraction_schema(
            schema_id=schema.id, payload=payload, current_user={"sub": "admin"}, db=db
        )

    assert schema.sample_file_key == new_key
    delete.assert_not_called()


# ---------- a missing sample file is reported clearly ------------------------

@pytest.mark.asyncio
async def test_sample_url_is_404_with_a_clear_message_when_the_file_is_gone():
    schema = ExtractionSchema(id=uuid4(), name="A", sample_file_key=f"{_prefix()}gone/form.pdf")
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)

    with patch.object(es_router, "blob_exists", MagicMock(return_value=False)), \
         patch.object(es_router, "generate_presigned_url", MagicMock()) as presign:
        with pytest.raises(HTTPException) as info:
            await es_router.get_extraction_schema_sample_url(
                schema_id=schema.id, current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 404
    assert "no longer stored" in info.value.detail
    presign.assert_not_called()


# ---------- a confirmation that is refused changes nothing --------------------

def _student_db(student_id, *, get_map):
    db = AsyncMock()

    def _get(model, key):
        return get_map(model, key)

    db.get = AsyncMock(side_effect=_get)
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=Student(id=student_id, user_id=uuid4())))
    )
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_confirm_refuses_a_type_already_verified_before_saving_anything():
    student_id = uuid4()
    replaced_id = uuid4()
    birth_type = uuid4()
    verified_type = uuid4()

    replaced = SimpleNamespace(id=replaced_id, student_id=student_id, document_type_id=birth_type, is_compiled_parent=False)
    submission = SimpleNamespace(
        id=uuid4(),
        student_id=student_id,
        status=SubmissionStatus.CLASSIFIED,
        document_type_id=None,
        parent_submission_id=replaced_id,
        classification_result=None,
    )
    verified_doc_type = DocumentType(id=verified_type, name="Transcript", code="TOR")

    def _map(model, key):
        if model is DocumentSubmission:
            return submission if key == submission.id else replaced
        if model is DocumentType:
            return verified_doc_type
        return None

    db = _student_db(student_id, get_map=_map)
    body = cls_router.ConfirmClassificationRequest(document_type_id=str(verified_type))

    with patch.object(cls_router, "ensure_user_row", AsyncMock(return_value=SimpleNamespace(id=uuid4()))), \
         patch.object(cls_router, "has_verified_submission", AsyncMock(return_value=True)):
        with pytest.raises(HTTPException) as info:
            await cls_router.confirm_classification(
                submission_id=submission.id, body=body, current_user={"sub": "student"}, db=db
            )

    assert info.value.status_code == 409
    assert "already been verified" in info.value.detail
    # Nothing was saved: the type is unchanged and the replacement link is still in place.
    assert submission.document_type_id is None
    assert submission.parent_submission_id == replaced_id
    db.commit.assert_not_awaited()
