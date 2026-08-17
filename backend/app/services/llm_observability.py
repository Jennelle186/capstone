"""Structured observability for LLM (Gemini) classification/extraction calls.

Emits one JSON log line per Gemini call attempt so that retry/failure patterns,
latency percentiles, and token usage can be aggregated by the
``backend/llm_metrics.py`` script without regex-scraping free-form text.

The structured fields are attached to the log record via the standard
``extra`` argument and serialized to real JSON by a dedicated handler, so the
fields land as machine-parseable data rather than being string-interpolated
into the message.
"""
from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import datetime, timezone

# Context carried from the job worker down to the Gemini call sites. The call
# sites (classify_with_gemini / extract_fields_from_document) only receive a
# ``file_key``, so these contextvars carry the document/submission id and job id
# that the worker layer already knows. asyncio.to_thread propagates contextvars
# into the worker thread, so the values survive the thread-pool hop.
document_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "llm_document_id", default=None
)
job_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "llm_job_id", default=None
)


class _JsonMetricFormatter(logging.Formatter):
    """Serialize the structured metric dict attached to the record as JSON.

    The metric dict is passed via ``extra={"llm_metric": {...}}``, which makes
    it a ``llm_metric`` attribute on the LogRecord. This formatter dumps that
    attribute as a single JSON object and ignores the free-text message.
    """

    def format(self, record: logging.LogRecord) -> str:
        metric = getattr(record, "llm_metric", None) or {}
        return json.dumps(metric)


_logger = logging.getLogger("llm.metrics")
_logger.propagate = False  # don't duplicate these lines into the root handler
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stderr)
    _handler.setFormatter(_JsonMetricFormatter())
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)


def log_llm_call(
    *,
    stage: str,
    model: str,
    latency_seconds: float,
    retry_count: int,
    status: str,
    prompt_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    page_count: int | None = None,
) -> None:
    """Emit a structured JSON log line for a single LLM call attempt.

    ``stage`` is ``"classification"`` or ``"extraction"``. ``status`` is one of
    ``success``, ``failed_504``, ``failed_429``, ``failed_other``, or
    ``timeout``. Token counts default to zero (the failure case). ``page_count``
    is optional because the pipeline does not currently extract PDF page counts.
    """
    fields = {
        "event": "llm_call",
        "document_id": document_id_var.get(),
        "job_id": job_id_var.get(),
        "stage": stage,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "latency_seconds": latency_seconds,
        "retry_count": retry_count,
        "status": status,
        "page_count": page_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _logger.info("", extra={"llm_metric": fields})
