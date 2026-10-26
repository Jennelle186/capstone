"""Tests for GCS storage helpers (list_blobs, delete_file_batch)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services import gcp_storage


def test_list_blobs_returns_names() -> None:
    bucket = MagicMock()
    bucket.list_blobs.return_value = [
        SimpleNamespace(name="staging/a.pdf"),
        SimpleNamespace(name="staging/b.pdf"),
    ]

    with patch.object(gcp_storage, "_bucket", return_value=bucket):
        keys = gcp_storage.list_blobs(prefix="staging/")

    assert keys == ["staging/a.pdf", "staging/b.pdf"]
    bucket.list_blobs.assert_called_once_with(prefix="staging/")


def test_list_blobs_raises_http_exception_on_error() -> None:
    bucket = MagicMock()
    bucket.list_blobs.side_effect = RuntimeError("boom")

    with patch.object(gcp_storage, "_bucket", return_value=bucket), pytest.raises(HTTPException) as exc:
        gcp_storage.list_blobs()

    assert exc.value.status_code == 502


def test_delete_file_batch_returns_empty_on_success() -> None:
    bucket = MagicMock()
    bucket.blob.return_value = MagicMock()  # .delete() succeeds

    with patch.object(gcp_storage, "_bucket", return_value=bucket):
        failed = gcp_storage.delete_file_batch(["a", "b"])

    assert failed == []


def test_delete_file_batch_returns_failed_keys_on_error() -> None:
    bucket = MagicMock()

    def _blob(key: str) -> MagicMock:
        blob = MagicMock()
        if key == "b":
            blob.delete.side_effect = RuntimeError("boom")
        return blob

    bucket.blob.side_effect = _blob

    with patch.object(gcp_storage, "_bucket", return_value=bucket):
        failed = gcp_storage.delete_file_batch(["a", "b"])

    assert failed == ["b"]
