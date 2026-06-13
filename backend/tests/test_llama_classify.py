from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llama_classify import (
    LlamaClassifyError,
    LlamaNoCreditsError,
    LlamaTimeoutError,
    classify_document,
    extract_classification_result,
    upload_file,
)


@pytest.fixture(autouse=True)
def _mock_api_key():
    with patch("app.services.llama_classify.get_llama_cloud_api_key", return_value="test-key"):
        yield


def _response(json_data=None, status_code=200, text=""):
    response = MagicMock()
    response.status_code = status_code
    response.is_error = status_code >= 400
    response.text = text or str(json_data)
    if json_data is not None:
        response.json = MagicMock(return_value=json_data)
    return response


@pytest.mark.asyncio
async def test_upload_file_returns_file_id() -> None:
    download_response = _response(status_code=200)
    download_response.content = b"pdf-bytes"

    upload_response = _response(json_data={"id": "file-123"}, status_code=200)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=download_response)
    mock_client.post = AsyncMock(return_value=upload_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        file_id = await upload_file("https://s3.example.com/file.pdf", "file.pdf", "application/pdf")

    assert file_id == "file-123"
    call_args, call_kwargs = mock_client.post.call_args
    assert call_args[0] == "https://api.cloud.llamaindex.ai/api/v1/files"
    files = call_kwargs["files"]
    assert "upload_file" in files


@pytest.mark.asyncio
async def test_upload_file_raises_no_credits_on_402() -> None:
    download_response = _response(status_code=200)
    download_response.content = b"pdf-bytes"
    upload_response = _response(status_code=402, text="Payment Required")

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=download_response)
    mock_client.post = AsyncMock(return_value=upload_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(LlamaNoCreditsError):
            await upload_file("https://s3.example.com/file.pdf", "file.pdf", "application/pdf")


@pytest.mark.asyncio
async def test_upload_file_raises_on_missing_file_id() -> None:
    download_response = _response(status_code=200)
    download_response.content = b"pdf-bytes"
    upload_response = _response(json_data={}, status_code=200)

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=download_response)
    mock_client.post = AsyncMock(return_value=upload_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(LlamaClassifyError):
            await upload_file("https://s3.example.com/file.pdf", "file.pdf", "application/pdf")


@pytest.mark.asyncio
async def test_classify_document_uses_v2_endpoint_and_body() -> None:
    create_response = _response(json_data={"id": "job-123", "status": "PENDING"}, status_code=200)
    completed_response = _response(
        json_data={
            "id": "job-123",
            "status": "COMPLETED",
            "result": {"type": "ADMISSION_FORM", "confidence": 0.95, "reasoning": "It matches."},
        },
        status_code=200,
    )

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=create_response)
    mock_client.get = AsyncMock(return_value=completed_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        result = await classify_document("file-123", [{"type": "ADMISSION_FORM", "description": "Admission form."}])

    assert result["result"]["type"] == "ADMISSION_FORM"
    post_args, post_kwargs = mock_client.post.call_args
    assert post_args[0] == "https://api.cloud.llamaindex.ai/api/v2/classify"
    assert post_kwargs["json"]["file_input"] == "file-123"
    assert "configuration" in post_kwargs["json"]
    assert post_kwargs["json"]["configuration"]["rules"][0]["type"] == "ADMISSION_FORM"


@pytest.mark.asyncio
async def test_classify_document_raises_on_failed_job() -> None:
    create_response = _response(json_data={"id": "job-123", "status": "PENDING"}, status_code=200)
    failed_response = _response(
        json_data={"id": "job-123", "status": "FAILED", "error_message": "Something broke"},
        status_code=200,
    )

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=create_response)
    mock_client.get = AsyncMock(return_value=failed_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(LlamaClassifyError):
            await classify_document("file-123", [{"type": "X", "description": "Y"}])


@pytest.mark.asyncio
async def test_classify_document_raises_on_timeout() -> None:
    create_response = _response(json_data={"id": "job-123", "status": "PENDING"}, status_code=200)
    running_response = _response(
        json_data={"id": "job-123", "status": "RUNNING"},
        status_code=200,
    )

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=create_response)
    mock_client.get = AsyncMock(return_value=running_response)

    with patch("app.services.llama_classify.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(LlamaTimeoutError):
            await classify_document("file-123", [{"type": "X", "description": "Y"}], max_wait_seconds=1)


def test_extract_classification_result_reads_v2_top_level_result() -> None:
    response = {
        "id": "job-123",
        "status": "COMPLETED",
        "result": {
            "type": "BIRTH_CERT",
            "confidence": 1.0,
            "reasoning": "Official birth certificate.",
        },
    }

    result = extract_classification_result(response)

    assert result == {
        "type": "BIRTH_CERT",
        "confidence": 1.0,
        "reasoning": "Official birth certificate.",
    }


def test_extract_classification_result_returns_none_when_no_result() -> None:
    response = {"id": "job-123", "status": "COMPLETED"}
    assert extract_classification_result(response) is None


def test_extract_classification_result_returns_none_for_non_dict_result() -> None:
    response = {"id": "job-123", "status": "COMPLETED", "result": "unexpected"}
    assert extract_classification_result(response) is None
