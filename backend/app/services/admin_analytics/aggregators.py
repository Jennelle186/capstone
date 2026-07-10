from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any

from ...schemas.extraction_schemas import AnalyticsMode


def infer_mode(field_type: str) -> AnalyticsMode:
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
    return s.replace("_", " ").title()


class Aggregator(ABC):
    @abstractmethod
    def aggregate(self, values: list, **kwargs) -> dict[str, Any]: ...


class DistributionAggregator(Aggregator):
    def aggregate(self, values: list, options: list[dict] | None = None) -> dict[str, Any]:
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


class NumericAggregator(Aggregator):
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
}