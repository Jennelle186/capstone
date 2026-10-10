"""Performance & reliability summarisers and result-file readers (plan, §8).

Generic consumers for any numeric sample stream (Locust output, health probes,
jobs exports). Provides ``rate``/``availability`` and JSON-line / JSON-array
readers shared by the report CLI.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from .stats import describe


def rate(success: int, total: int) -> float | None:
    """Success proportion; ``None`` when ``total <= 0``."""
    if total <= 0:
        return None
    return round(success / total, 6)


def availability(ok_probes: int, total_probes: int) -> float | None:
    """Availability % = healthy probes / total probes; ``None`` when no probes."""
    r = rate(ok_probes, total_probes)
    return None if r is None else round(r * 100, 4)


def summarise_samples(values: Iterable[float]) -> dict:
    """``describe`` wrapper normalized for report output (adds n)."""
    d = describe(values)
    d["n"] = d["count"]
    return d


def read_json_lines(path: str | Path) -> list[dict]:
    """Parse every JSON object line from a log (``llm_calls.log`` style)."""
    events: list[dict] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                events.append(obj)
    return events


def read_json_array(path: str | Path) -> list:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


def job_summary(rows: Iterable[dict]) -> dict:
    """Completion/failure/requeue summary from a jobs export.

    Rows: list of dicts with ``status`` (queued|running|completed|failed) plus
    optional ``requeued`` (bool). Returns None-safe rates.
    """
    statuses: dict[str, int] = {}
    for row in rows:
        status = str(row.get("status") or "unknown")
        statuses[status] = statuses.get(status, 0) + 1
    total = sum(statuses.values())
    completed = statuses.get("completed", 0)
    failed = statuses.get("failed", 0)
    return {
        "total": total,
        "statuses": statuses,
        "completion_rate": rate(completed, total),
        "failure_rate": rate(failed, total),
    }