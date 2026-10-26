"""Tests for the GCS orphan cleanup service (Phase 5)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import gcs_cleanup


@pytest.mark.asyncio
async def test_collect_referenced_keys_includes_submissions_and_logo() -> None:
    rows = MagicMock()
    rows.scalars.return_value.all.return_value = ["staging/1.pdf", "production/2.pdf"]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=rows)
    db.get = AsyncMock(return_value=SimpleNamespace(logo_file_key="branding/logo.png"))

    keys = await gcs_cleanup.collect_referenced_keys(db)

    assert keys == {"staging/1.pdf", "production/2.pdf", "branding/logo.png"}


@pytest.mark.asyncio
async def test_collect_referenced_keys_ignores_empty_file_keys_and_missing_logo() -> None:
    rows = MagicMock()
    rows.scalars.return_value.all.return_value = ["staging/1.pdf", ""]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=rows)
    db.get = AsyncMock(return_value=None)

    keys = await gcs_cleanup.collect_referenced_keys(db)

    assert keys == {"staging/1.pdf"}


@pytest.mark.asyncio
async def test_find_orphaned_keys_diffs_bucket_against_db(monkeypatch) -> None:
    monkeypatch.setattr(
        gcs_cleanup, "_scan_prefixes", lambda prefixes: ["staging/a.pdf", "staging/b.pdf"]
    )

    async def fake_referenced(db):
        return {"staging/a.pdf"}

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)

    orphans = await gcs_cleanup.find_orphaned_keys(AsyncMock())

    assert orphans == ["staging/b.pdf"]


@pytest.mark.asyncio
async def test_run_cleanup_dry_run_does_not_delete(monkeypatch) -> None:
    monkeypatch.setattr(
        gcs_cleanup, "_scan_prefixes", lambda prefixes: ["staging/a.pdf", "staging/b.pdf"]
    )

    async def fake_referenced(db):
        return {"staging/a.pdf"}

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)

    delete_calls: list = []
    monkeypatch.setattr(gcs_cleanup, "delete_file_batch", lambda keys: delete_calls.append(keys) or [])

    result = await gcs_cleanup.run_cleanup(AsyncMock(), dry_run=True)

    assert result["orphaned_keys"] == ["staging/b.pdf"]
    assert result["deleted_count"] == 0
    assert delete_calls == []  # nothing deleted in dry-run


@pytest.mark.asyncio
async def test_run_cleanup_executes_delete(monkeypatch) -> None:
    monkeypatch.setattr(gcs_cleanup, "_scan_prefixes", lambda prefixes: ["staging/b.pdf"])

    async def fake_referenced(db):
        return set()

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)
    monkeypatch.setattr(gcs_cleanup, "delete_file_batch", lambda keys: [])

    result = await gcs_cleanup.run_cleanup(AsyncMock(), dry_run=False)

    assert result["deleted_count"] == 1
    assert result["failed_keys"] == []


@pytest.mark.asyncio
async def test_run_cleanup_no_orphans_deletes_nothing(monkeypatch) -> None:
    monkeypatch.setattr(gcs_cleanup, "_scan_prefixes", lambda prefixes: [])

    async def fake_referenced(db):
        return {"staging/a.pdf"}

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)

    delete_calls: list = []
    monkeypatch.setattr(gcs_cleanup, "delete_file_batch", lambda keys: delete_calls.append(keys) or [])

    result = await gcs_cleanup.run_cleanup(AsyncMock(), dry_run=False)

    assert result["orphaned_keys"] == []
    assert result["deleted_count"] == 0
    assert delete_calls == []  # nothing to delete


@pytest.mark.asyncio
async def test_run_cleanup_reports_failed_deletes(monkeypatch) -> None:
    monkeypatch.setattr(
        gcs_cleanup, "_scan_prefixes", lambda prefixes: ["staging/a.pdf", "staging/b.pdf"]
    )

    async def fake_referenced(db):
        return set()

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)
    monkeypatch.setattr(gcs_cleanup, "delete_file_batch", lambda keys: ["staging/b.pdf"])

    result = await gcs_cleanup.run_cleanup(AsyncMock(), dry_run=False)

    assert result["deleted_count"] == 1
    assert result["failed_keys"] == ["staging/b.pdf"]


@pytest.mark.asyncio
async def test_find_orphaned_keys_custom_prefixes(monkeypatch) -> None:
    monkeypatch.setattr(gcs_cleanup, "_scan_prefixes", lambda prefixes: ["prod/x.pdf"])

    async def fake_referenced(db):
        return set()

    monkeypatch.setattr(gcs_cleanup, "collect_referenced_keys", fake_referenced)

    orphans = await gcs_cleanup.find_orphaned_keys(AsyncMock(), prefixes=("prod/",))

    assert orphans == ["prod/x.pdf"]


def test_scan_prefixes_aggregates_multiple_prefixes(monkeypatch) -> None:
    def fake_list_blobs(prefix):
        return [f"{prefix}a", f"{prefix}b"]

    monkeypatch.setattr(gcs_cleanup, "list_blobs", fake_list_blobs)

    keys = gcs_cleanup._scan_prefixes(("p1/", "p2/"))

    assert keys == ["p1/a", "p1/b", "p2/a", "p2/b"]


# ── cleanup endpoint ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_orphaned_files_endpoint(monkeypatch) -> None:
    from app.routers.admin import gcs_cleanup as router

    async def fake_run_cleanup(db, dry_run):
        return {
            "dry_run": dry_run,
            "scanned": 3,
            "orphaned_count": 1,
            "deleted_count": 0 if dry_run else 1,
            "failed_keys": [],
            "orphaned_keys": ["staging/orphan.pdf"],
        }

    monkeypatch.setattr(router, "run_cleanup", fake_run_cleanup)

    dry = await router.cleanup_orphaned_files(router.GcsCleanupRequest(dry_run=True), {}, AsyncMock())
    assert dry.dry_run is True
    assert dry.deleted_count == 0
    assert dry.orphaned_keys == ["staging/orphan.pdf"]

    run = await router.cleanup_orphaned_files(router.GcsCleanupRequest(dry_run=False), {}, AsyncMock())
    assert run.deleted_count == 1
