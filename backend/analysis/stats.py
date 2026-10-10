"""Descriptive statistics helpers (testing plan, Section 8).

All functions are empty-safe: they return ``None`` (or the ``count`` only) for
an empty input so reports show an explicit "no data" rather than NaN/ZeroDivision.
Percentiles use linear interpolation, matching the existing ``llm_metrics.py``.

Guidance (§8 of the plan):
  * ``describe`` is the default summariser (mean/median/min/max/std + p10..p99).
  * Median + percentiles suit skewed data (latencies, upload times); mean ± std
    suits symmetric data and Likert-style aggregates.
"""
from __future__ import annotations

from collections.abc import Iterable
from statistics import pstdev, stdev

PERCENTILE_KEYS = ("p10", "p25", "p50", "p75", "p90", "p95", "p99")


def _coerce(values: Iterable[float | int | None]) -> list[float]:
    return [float(v) for v in values if v is not None]


def percentile(values: Iterable[float], p: float) -> float | None:
    """Linear-interpolated percentile for ``p`` in ``[0, 1]``; ``None`` when empty."""
    ordered = sorted(_coerce(values))
    if not ordered:
        return None
    k = (len(ordered) - 1) * p
    f = int(k)
    c = k - f
    if f + 1 < len(ordered):
        return round(ordered[f] + (ordered[f + 1] - ordered[f]) * c, 6)
    return float(ordered[f])


def mean(values: Iterable[float]) -> float | None:
    cleaned = _coerce(values)
    return round(sum(cleaned) / len(cleaned), 6) if cleaned else None


def median(values: Iterable[float]) -> float | None:
    cleaned = _coerce(values)
    if not cleaned:
        return None
    ordered = sorted(cleaned)
    n = len(ordered)
    mid = n // 2
    return ordered[mid] if n % 2 else round((ordered[mid - 1] + ordered[mid]) / 2, 6)


def minimum(values: Iterable[float]) -> float | None:
    cleaned = _coerce(values)
    return min(cleaned) if cleaned else None


def maximum(values: Iterable[float]) -> float | None:
    cleaned = _coerce(values)
    return max(cleaned) if cleaned else None


def std(values: Iterable[float], sample: bool = True) -> float | None:
    """Standard deviation. Sample SD needs >= 2 points and returns ``None`` otherwise."""
    cleaned = _coerce(values)
    if sample:
        if len(cleaned) < 2:
            return None
        return round(stdev(cleaned), 6)
    if not cleaned:
        return None
    return round(pstdev(cleaned), 6)


def describe(values: Iterable[float]) -> dict:
    """Canonical summary: count, mean, median, min, max, std, p10..p99."""
    cleaned = _coerce(values)
    return {
        "count": len(cleaned),
        "mean": mean(cleaned),
        "median": median(cleaned),
        "min": minimum(cleaned),
        "max": maximum(cleaned),
        "std": std(cleaned),
        "percentiles": {k: percentile(cleaned, int(k[1:]) / 100) for k in PERCENTILE_KEYS},
    }