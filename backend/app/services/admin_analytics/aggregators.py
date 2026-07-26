from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any

from ...schemas.extraction_schemas import AnalyticsMode


def infer_mode(field_type: str) -> AnalyticsMode:
    """Map a raw field type (``"number"``, ``"select"``, …) to the analytics
    mode that should be used to aggregate it."""
    mapping: dict[str, AnalyticsMode] = {
        "number": "numeric_summary",
        "integer": "numeric_summary",
        "select": "distribution",
        "multi-select": "distribution",
        "boolean": "boolean_summary",
        "string": "distribution",
    }
    return mapping.get(field_type, "distribution")


def snake_to_title(s: str) -> str:
    """Convert ``"some_field_name"`` → ``"Some Field Name"``."""
    return s.replace("_", " ").title()


class Aggregator(ABC):
    """Base class for all analytics aggregators.

    Subclasses implement ``aggregate(values, **kwargs)`` which turns a list of
    raw extracted values into a summary dict consumed by the front-end.
    """

    @abstractmethod
    def aggregate(self, values: list, **kwargs) -> dict[str, Any]: ...


class DistributionAggregator(Aggregator):
    """Count occurrences of each distinct value and return a sorted
    distribution list with counts and percentages.

    Supports ``options`` — an optional list of ``{value, label}`` dicts that
    map raw stored values to human-readable labels.
    """

    def aggregate(self, values: list, options: list[dict] | None = None, **kwargs) -> dict[str, Any]:
        value_to_label: dict[str, str] = {}
        if options:
            for opt in options:
                raw = str(opt.get("value", "")).strip().lower()
                label = opt.get("label", "")
                if raw and label:
                    value_to_label[raw] = label

        counts: dict[str, int] = defaultdict(int)
        for v in values:
            items = v if isinstance(v, list) else [v]
            for item in items:
                key = str(item).strip().lower()
                if not key:
                    continue
                counts[key] += 1

        total = len(values)
        distribution = sorted(
            [
                {
                    "label": value_to_label.get(k, snake_to_title(k)),
                    "count": c,
                    "percentage": round(c / total * 100, 1) if total else 0.0,
                }
                for k, c in counts.items()
            ],
            key=lambda x: x["count"],
            reverse=True,
        )
        return {
            "distribution": distribution,
            "student_count": total,
            "distribution_basis": "students",
        }


class BucketizedAggregator(Aggregator):
    """Sort numeric values into pre-defined buckets and return a distribution.

    Each bucket is defined by ``{label, min, max}``.  A value falls into the
    first bucket where ``min <= value < max``.  Values greater than or equal to
    the last bucket's ``max`` are still counted in the last bucket.
    """

    def aggregate(self, values: list, buckets: list[dict] | None = None, **kwargs) -> dict[str, Any]:
        nums = [v for v in values if isinstance(v, (int, float))]
        total = len(nums)

        if not buckets:
            return {"distribution": [], "student_count": 0, "distribution_basis": "students"}

        sorted_buckets = sorted(buckets, key=lambda b: b.get("min") if b.get("min") is not None else float("-inf"))

        counts: dict[int, int] = {}
        for i, _ in enumerate(sorted_buckets):
            counts[i] = 0

        for v in nums:
            assigned = False
            for i, b in enumerate(sorted_buckets):
                lo = b.get("min")
                hi = b.get("max")
                in_range = True
                if lo is not None and v < lo:
                    in_range = False
                if hi is not None and v >= hi:
                    in_range = False
                if in_range:
                    counts[i] += 1
                    assigned = True
                    break

            # Values above the last bucket's explicit max are still tallied
            # in the final bucket to avoid dropping data.
            if not assigned:
                last_idx = len(sorted_buckets) - 1
                above_last = sorted_buckets[last_idx].get("max") is not None and v >= sorted_buckets[last_idx]["max"]
                if above_last:
                    counts[last_idx] += 1

        distribution = [
            {
                "label": b.get("label", f'{b.get("min", "")}-{b.get("max", "")}'),
                "count": counts[i],
                "percentage": round(counts[i] / total * 100, 1) if total else 0.0,
            }
            for i, b in enumerate(sorted_buckets)
        ]

        return {
            "distribution": distribution,
            "student_count": total,
            "distribution_basis": "students",
        }


class NumericAggregator(Aggregator):
    """Compute descriptive statistics (mean, median, min, max, std, sum) over
    a list of numeric values."""

    def aggregate(self, values: list, **kwargs) -> dict[str, Any]:
        nums = [v for v in values if isinstance(v, (int, float))]
        if not nums:
            return {
                "count": 0,
                "mean": None,
                "median": None,
                "min": None,
                "max": None,
                "std": None,
                "sum": None,
            }
        sorted_nums = sorted(nums)
        n = len(sorted_nums)
        mean = sum(sorted_nums) / n
        if n % 2:
            median = float(sorted_nums[n // 2])
        else:
            median = (sorted_nums[n // 2 - 1] + sorted_nums[n // 2]) / 2
        variance = sum((x - mean) ** 2 for x in sorted_nums) / n
        return {
            "count": n,
            "mean": round(mean, 4),
            "median": round(median, 4),
            "min": sorted_nums[0],
            "max": sorted_nums[-1],
            "std": round(variance ** 0.5, 4),
            "sum": round(sum(sorted_nums), 4),
        }


class BooleanAggregator(Aggregator):
    """Count true/false occurrences and return counts with percentages."""

    def aggregate(self, values: list, **kwargs) -> dict[str, Any]:
        trues = sum(1 for v in values if v is True)
        falses = sum(1 for v in values if v is False)
        total = trues + falses
        return {
            "true": (
                {"count": trues, "percentage": round(trues / total * 100, 1)}
                if total
                else {"count": 0, "percentage": None}
            ),
            "false": (
                {"count": falses, "percentage": round(falses / total * 100, 1)}
                if total
                else {"count": 0, "percentage": None}
            ),
            "count": total,
        }


AGGREGATORS: dict[str, Aggregator] = {
    "distribution": DistributionAggregator(),
    "numeric_summary": NumericAggregator(),
    "boolean_summary": BooleanAggregator(),
    "bucketized": BucketizedAggregator(),
}
