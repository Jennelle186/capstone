"""Summarize LLM (Gemini) call telemetry emitted by ``llm.metrics``.

The observability layer (``app/services/llm_observability.py``) writes one JSON
object per classification/extraction attempt to stderr. This script parses those
lines (from a log file or stdin) and prints aggregate metrics so we can answer,
after a change ships:

  * Is the Vertex AI 504/429 rate elevated vs. baseline?
  * Did a concurrency/timeout change improve throughput or reduce failures?
  * What is the per-stage latency distribution and token/cost footprint?

Usage:
    python llm_metrics.py --file backend.log --since 24h
    python llm_metrics.py --since 7d < backend.log

Pricing is read from the ``VERTEX_INPUT_PRICE_PER_1M`` / ``VERTEX_OUTPUT_PRICE_PER_1M``
environment variables (USD per 1M tokens) and defaults to recent Gemini Flash
list prices; confirm current rates before relying on the cost figure, as Vertex
AI pricing changes over time.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone


def _parse_time_window(since: str | None, until: str | None):
    """Resolve --since/--until into (start, end) aware datetimes, or (None, None)."""
    now = datetime.now(timezone.utc)

    def _resolve(value: str) -> datetime:
        value = value.strip()
        # Relative form like "24h", "7d", "30m"
        if value[-1] in "smhd" and value[:-1].isdigit():
            n = int(value[:-1])
            unit = value[-1]
            delta = {
                "s": timedelta(seconds=n),
                "m": timedelta(minutes=n),
                "h": timedelta(hours=n),
                "d": timedelta(days=n),
            }[unit]
            return now - delta
        # Absolute ISO timestamp
        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    start = _resolve(since) if since else None
    end = _resolve(until) if until else None
    return start, end


def _iter_llm_events(stream) -> list[dict]:
    """Extract and parse every ``llm_call`` JSON line from the input stream."""
    events: list[dict] = []
    for line in stream:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue  # ignore non-JSON lines (free-text logs)
        if obj.get("event") == "llm_call":
            events.append(obj)
    return events


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    k = (len(ordered) - 1) * p
    f = int(k)
    c = k - f
    if f + 1 < len(ordered):
        return ordered[f] + (ordered[f + 1] - ordered[f]) * c
    return ordered[f]


def _format_pct(x: float | None) -> str:
    return "—" if x is None else f"{x:.1f}%"


def _format_num(x: float | None) -> str:
    return "—" if x is None else f"{x:.3f}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize LLM call telemetry.")
    parser.add_argument("--file", help="Path to a log file (defaults to stdin).")
    parser.add_argument("--since", help="Start of time window, e.g. 24h, 7d, or ISO.")
    parser.add_argument("--until", help="End of time window, e.g. ISO timestamp.")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as fh:
            events = _iter_llm_events(fh)
    else:
        events = _iter_llm_events(sys.stdin)

    if not events:
        print("No llm_call events found in the provided input.")
        return 0

    start, end = _parse_time_window(args.since, args.until)

    # Filter by time window using the embedded timestamp.
    def _in_window(ev: dict) -> bool:
        ts = ev.get("timestamp")
        if not ts:
            return True  # no timestamp -> include (can't filter)
        try:
            t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return True
        if start and t < start:
            return False
        if end and t > end:
            return False
        return True

    events = [e for e in events if _in_window(e)]
    if not events:
        print("No llm_call events in the requested time window.")
        return 0

    attempts = len(events)
    failed_504 = sum(1 for e in events if e.get("status") == "failed_504")
    failed_429 = sum(1 for e in events if e.get("status") == "failed_429")
    successes = sum(1 for e in events if e.get("status") == "success")

    # Retry counts are recorded per attempt; report the max per document+stage.
    max_retries = [
        e.get("retry_count", 0)
        for e in events
        if e.get("status") == "success"
    ]

    print("=== LLM Call Telemetry Summary ===")
    print(f"Attempts (in window): {attempts}")
    print(f"Successes:            {successes}")
    print(f"504 rate:             {_format_pct(failed_504 / attempts * 100)} ({failed_504})")
    print(f"429 rate:             {_format_pct(failed_429 / attempts * 100)} ({failed_429})")
    print(f"Avg retry count:      {_format_num(statistics.mean(max_retries) if max_retries else 0.0)}")
    print()

    # Per-stage latency and token aggregates.
    stages = sorted({e.get("stage") for e in events if e.get("stage")})
    for stage in stages:
        stage_events = [e for e in events if e.get("stage") == stage]
        latencies = [e["latency_seconds"] for e in stage_events if e.get("latency_seconds") is not None]
        prompt_tokens = [e.get("prompt_tokens", 0) for e in stage_events]
        output_tokens = [e.get("output_tokens", 0) for e in stage_events]

        print(f"--- Stage: {stage} ---")
        print(f"  calls:            {len(stage_events)}")
        print(f"  latency p50/p95/p99: "
              f"{_format_num(_percentile(latencies, 0.50))} / "
              f"{_format_num(_percentile(latencies, 0.95))} / "
              f"{_format_num(_percentile(latencies, 0.99))} s")
        print(f"  avg prompt tokens:  {statistics.mean(prompt_tokens):.1f}")
        print(f"  avg output tokens:  {statistics.mean(output_tokens):.1f}")
        print()

    # Cost estimate from configurable per-1M-token prices.
    input_price = float(os.getenv("VERTEX_INPUT_PRICE_PER_1M", "0.10"))
    output_price = float(os.getenv("VERTEX_OUTPUT_PRICE_PER_1M", "0.40"))
    total_input = sum(e.get("prompt_tokens", 0) for e in events)
    total_output = sum(e.get("output_tokens", 0) for e in events)
    cost = (total_input / 1_000_000) * input_price + (total_output / 1_000_000) * output_price
    print("--- Cost (prices configurable via env; verify current rates) ---")
    print(f"  total input tokens:  {total_input}")
    print(f"  total output tokens: {total_output}")
    print(f"  estimated cost:      ${cost:.6f} USD")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
