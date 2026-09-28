"""LLM call telemetry aggregation (plan, Section 4/8, "P" and "F-AI").

Consumes the JSON lines emitted by ``app/services/llm_observability.py``
(event ``llm_call``) — the same stream ``llm_metrics.py`` reads, factored here
as pure, testable functions. Price defaults match ``llm_metrics.py`` (Gemini
Flash) and are overridable via env vars.
"""
from __future__ import annotations

import os
from collections.abc import Mapping

from .stats import mean, percentile, std


def _pct(x: float | None) -> float | None:
    return None if x is None else round(x * 100, 4)


def summarise_llm(
    events: list[Mapping],
    input_price_per_1m: float | None = None,
    output_price_per_1m: float | None = None,
) -> dict:
    """Aggregate a list of ``llm_call`` events into the report's telemetry block."""
    attempts = len(events)
    failed_504 = sum(1 for e in events if e.get("status") == "failed_504")
    failed_429 = sum(1 for e in events if e.get("status") == "failed_429")
    successes = sum(1 for e in events if e.get("status") == "success")

    retries = [int(e.get("retry_count", 0)) for e in events if e.get("status") == "success"]
    avg_retry_count = round(mean(retries) or 0.0, 4)

    stages: dict[str, dict] = {}
    for stage in sorted({e.get("stage") for e in events if e.get("stage")}):
        stage_events = [e for e in events if e.get("stage") == stage]
        latencies = [
            float(e["latency_seconds"])
            for e in stage_events
            if e.get("latency_seconds") is not None
        ]
        prompt_tokens = [int(e.get("prompt_tokens", 0)) for e in stage_events]
        output_tokens = [int(e.get("output_tokens", 0)) for e in stage_events]
        stages[str(stage)] = {
            "calls": len(stage_events),
            "latency_s": {
                "p50": percentile(latencies, 0.50),
                "p95": percentile(latencies, 0.95),
                "p99": percentile(latencies, 0.99),
                "mean": mean(latencies),
                "std": std(latencies),
            },
            "avg_prompt_tokens": round(mean(prompt_tokens) or 0.0, 1),
            "avg_output_tokens": round(mean(output_tokens) or 0.0, 1),
        }

    total_input = sum(int(e.get("prompt_tokens", 0)) for e in events)
    total_output = sum(int(e.get("output_tokens", 0)) for e in events)
    if input_price_per_1m is None:
        input_price_per_1m = float(os.getenv("VERTEX_INPUT_PRICE_PER_1M", "0.10"))
    if output_price_per_1m is None:
        output_price_per_1m = float(os.getenv("VERTEX_OUTPUT_PRICE_PER_1M", "0.40"))
    cost = (total_input / 1_000_000) * input_price_per_1m + (
        total_output / 1_000_000
    ) * output_price_per_1m

    return {
        "attempts": attempts,
        "successes": successes,
        "failure_rate": _pct((attempts - successes) / attempts) if attempts else None,
        "failed_504": failed_504,
        "failed_429": failed_429,
        "failed_504_rate": _pct(failed_504 / attempts) if attempts else None,
        "failed_429_rate": _pct(failed_429 / attempts) if attempts else None,
        "avg_retry_count": avg_retry_count,
        "per_stage": stages,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "estimated_cost_usd": round(cost, 6),
    }