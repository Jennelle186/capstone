"""Discarding unsaved samples and cleaning up unused ones.

A sample that a saved schema points at must never be deleted by either path, and
the cleanup never touches a sample uploaded more recently than the minimum age.
Storage and the database are mocked.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers.admin import extraction_schemas as es_router
from app.schemas.extraction_schemas import SampleCleanupRequest, SampleDiscardRequest
from app.services import gcp_storage


def _prefix() -> str:
    return gcp_storage._admin_sample_prefix()


def _old():
    return datetime.now(timezone.utc) - timedelta(hours=5)


def _fresh():
    return datetime.now(timezone.utc) - timedelta(minutes=5)


def _db_first(row):
    result = MagicMock()
    result.first.return_value = row
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def _db_referenced(keys):
    result = MagicMock()
    result.scalars.return_value.all.return_value = keys
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ---------- discard ---------------------------------------------------------

@pytest.mark.asyncio
async def test_discard_deletes_an_unused_generated_sample():
    key = f"{_prefix()}abc/form.pdf"
    db = _db_first(None)

    with patch.object(es_router, "delete_file_checked", MagicMock(return_value=True)) as delete:
        response = await es_router.discard_unsaved_sample(
            payload=SampleDiscardRequest(file_id=key), current_user={"sub": "admin"}, db=db
        )

    assert response.deleted is True
    delete.assert_called_once_with(key)


@pytest.mark.asyncio
async def test_discard_reports_false_when_the_file_was_already_gone():
    key = f"{_prefix()}abc/form.pdf"
    db = _db_first(None)

    with patch.object(es_router, "delete_file_checked", MagicMock(return_value=False)):
        response = await es_router.discard_unsaved_sample(
            payload=SampleDiscardRequest(file_id=key), current_user={"sub": "admin"}, db=db
        )

    assert response.deleted is False


@pytest.mark.asyncio
async def test_discard_reports_false_when_storage_fails():
    key = f"{_prefix()}abc/form.pdf"
    db = _db_first(None)

    with patch.object(es_router, "delete_file_checked", MagicMock(side_effect=RuntimeError("storage down"))):
        response = await es_router.discard_unsaved_sample(
            payload=SampleDiscardRequest(file_id=key), current_user={"sub": "admin"}, db=db
        )

    assert response.deleted is False


@pytest.mark.asyncio
async def test_discard_refuses_a_sample_a_saved_schema_still_uses():
    key = f"{_prefix()}abc/form.pdf"
    db = _db_first((uuid4(),))

    with patch.object(es_router, "delete_file_checked", MagicMock()) as delete:
        response = await es_router.discard_unsaved_sample(
            payload=SampleDiscardRequest(file_id=key), current_user={"sub": "admin"}, db=db
        )

    assert response.deleted is False
    delete.assert_not_called()


@pytest.mark.asyncio
async def test_discard_rejects_keys_outside_the_sample_prefix():
    db = _db_first(None)

    with patch.object(es_router, "delete_file_checked", MagicMock()) as delete:
        with pytest.raises(HTTPException) as info:
            await es_router.discard_unsaved_sample(
                payload=SampleDiscardRequest(file_id="staging/x/y.pdf"), current_user={"sub": "admin"}, db=db
            )

    assert info.value.status_code == 400
    delete.assert_not_called()


# ---------- cleanup ---------------------------------------------------------

@pytest.mark.asyncio
async def test_cleanup_dry_run_lists_unused_samples_and_deletes_nothing():
    kept = f"{_prefix()}kept/a.pdf"
    orphan = f"{_prefix()}orphan/b.pdf"
    db = _db_referenced([kept])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value={kept: _old(), orphan: _old()})), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(), current_user={"sub": "admin"}, db=db
        )

    assert response.dry_run is True
    assert response.orphaned_keys == [orphan]
    assert response.deleted_count == 0
    batch.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_deletes_only_unused_samples_when_not_a_dry_run():
    kept = f"{_prefix()}kept/a.pdf"
    orphan = f"{_prefix()}orphan/b.pdf"
    db = _db_referenced([kept])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value={kept: _old(), orphan: _old()})), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(dry_run=False), current_user={"sub": "admin"}, db=db
        )

    batch.assert_called_once_with([orphan])
    assert response.deleted_count == 1
    assert response.failed_keys == []


@pytest.mark.asyncio
async def test_cleanup_keeps_a_recent_unsaved_sample():
    recent = f"{_prefix()}recent/c.pdf"
    db = _db_referenced([])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value={recent: _fresh()})), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(dry_run=False), current_user={"sub": "admin"}, db=db
        )

    assert response.orphaned_keys == []
    batch.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_never_deletes_a_referenced_sample_however_old():
    kept = f"{_prefix()}kept/a.pdf"
    db = _db_referenced([kept])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value={kept: _old()})), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(dry_run=False, min_age_minutes=0), current_user={"sub": "admin"}, db=db
        )

    assert response.orphaned_keys == []
    batch.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_only_scans_the_sample_prefix():
    db = _db_referenced([])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value={})) as listing:
        await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(), current_user={"sub": "admin"}, db=db
        )

    listing.assert_called_once_with(_prefix())


# ---------- cleanup deletes only what the admin confirmed -------------------

@pytest.mark.asyncio
async def test_cleanup_deletes_only_the_keys_confirmed_in_the_dry_run():
    confirmed = f"{_prefix()}old1/a.pdf"
    appeared_since = f"{_prefix()}old2/b.pdf"
    ages = {confirmed: _old(), appeared_since: _old()}
    db = _db_referenced([])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value=ages)), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(dry_run=False, confirmed_keys=[confirmed]),
            current_user={"sub": "admin"},
            db=db,
        )

    batch.assert_called_once_with([confirmed])
    assert response.deleted_count == 1
    assert set(response.orphaned_keys) == {confirmed, appeared_since}


@pytest.mark.asyncio
async def test_cleanup_never_deletes_a_confirmed_key_that_is_now_in_use():
    key = f"{_prefix()}old3/c.pdf"
    ages = {key: _old()}
    db = _db_referenced([key])

    with patch.object(es_router, "list_blob_times", MagicMock(return_value=ages)), \
         patch.object(es_router, "delete_file_batch", MagicMock(return_value=[])) as batch:
        response = await es_router.cleanup_unused_samples(
            payload=SampleCleanupRequest(dry_run=False, confirmed_keys=[key]),
            current_user={"sub": "admin"},
            db=db,
        )

    batch.assert_not_called()
    assert response.deleted_count == 0
