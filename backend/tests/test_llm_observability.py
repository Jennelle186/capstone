"""Tests for the structured LLM observability logging layer."""
from __future__ import annotations

import io
import json
import logging

from app.services.llm_observability import (
    _JsonMetricFormatter,
    document_id_var,
    job_id_var,
    log_llm_call,
)


def test_json_formatter_serializes_llm_metric() -> None:
    """The formatter emits a single JSON object from the structured metric dict."""
    record = logging.LogRecord(
        name="llm.metrics",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="",
        args=(),
        exc_info=None,
    )
    record.llm_metric = {"event": "llm_call", "status": "success"}

    out = _JsonMetricFormatter().format(record)
    assert json.loads(out) == {"event": "llm_call", "status": "success"}


def test_log_llm_call_emits_all_fields_as_json() -> None:
    """log_llm_call writes one JSON line containing every observability field.

    A temporary handler (with the JSON formatter) is attached to the
    ``llm.metrics`` logger so the output can be captured even though the logger
    has propagate=False.
    """
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(_JsonMetricFormatter())
    logger = logging.getLogger("llm.metrics")
    logger.addHandler(handler)
    try:
        token = document_id_var.set("doc-123")
        job_token = job_id_var.set("job-456")
        try:
            log_llm_call(
                stage="classification",
                model="gemini-3.5-flash",
                latency_seconds=12.34,
                retry_count=1,
                status="success",
                prompt_tokens=100,
                output_tokens=20,
                total_tokens=120,
                page_count=2,
            )
        finally:
            document_id_var.reset(token)
            job_id_var.reset(job_token)
    finally:
        logger.removeHandler(handler)

    line = stream.getvalue().strip()
    assert line, "expected a JSON log line"
    obj = json.loads(line)

    # Every field from the observability table must be present and populated.
    assert obj["event"] == "llm_call"
    assert obj["document_id"] == "doc-123"
    assert obj["job_id"] == "job-456"
    assert obj["stage"] == "classification"
    assert obj["model"] == "gemini-3.5-flash"
    assert obj["prompt_tokens"] == 100
    assert obj["output_tokens"] == 20
    assert obj["total_tokens"] == 120
    assert obj["latency_seconds"] == 12.34
    assert obj["retry_count"] == 1
    assert obj["status"] == "success"
    assert obj["page_count"] == 2
    assert "timestamp" in obj


def test_log_llm_call_defaults_tokens_to_zero_on_failure() -> None:
    """Failed attempts default token counts to zero."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(_JsonMetricFormatter())
    logger = logging.getLogger("llm.metrics")
    logger.addHandler(handler)
    try:
        log_llm_call(
            stage="extraction",
            model="gemini-3.5-flash",
            latency_seconds=60.0,
            retry_count=3,
            status="failed_504",
        )
    finally:
        logger.removeHandler(handler)

    obj = json.loads(stream.getvalue().strip())
    assert obj["prompt_tokens"] == 0
    assert obj["output_tokens"] == 0
    assert obj["total_tokens"] == 0
    assert obj["status"] == "failed_504"
