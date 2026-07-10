from __future__ import annotations

from uuid import uuid4

import pytest

from app.services.admin_analytics.aggregators import (
    AGGREGATORS,
    BooleanAggregator,
    DistributionAggregator,
    NumericAggregator,
    infer_mode,
)


class TestInferMode:
    def test_number_returns_numeric_summary(self):
        assert infer_mode("number") == "numeric_summary"
        assert infer_mode("integer") == "numeric_summary"

    def test_select_returns_distribution(self):
        assert infer_mode("select") == "distribution"
        assert infer_mode("multi-select") == "distribution"
        assert infer_mode("string") == "distribution"

    def test_boolean_returns_boolean_summary(self):
        assert infer_mode("boolean") == "boolean_summary"

    def test_unknown_type_defaults_to_distribution(self):
        assert infer_mode("unknown") == "distribution"


class TestDistributionAggregator:
    def test_single_select(self):
        values = ["male", "female", "male", "male", "female"]
        result = DistributionAggregator().aggregate(values)
        assert result["student_count"] == 5
        assert result["distribution_basis"] == "students"
        assert len(result["distribution"]) == 2
        labels = {d["label"]: d["count"] for d in result["distribution"]}
        assert labels["male"] == 3
        assert labels["female"] == 2

    def test_multi_select(self):
        values = [
            ["visayan", "tagalog"],
            ["visayan"],
            ["tagalog", "zamboangueno"],
        ]
        result = DistributionAggregator().aggregate(values)
        assert result["student_count"] == 3
        assert len(result["distribution"]) == 3

    def test_empty_values(self):
        result = DistributionAggregator().aggregate([])
        assert result["student_count"] == 0
        assert result["distribution"] == []


class TestNumericAggregator:
    def test_basic_stats(self):
        values = [1, 2, 3, 4, 5]
        result = NumericAggregator().aggregate(values)
        assert result["count"] == 5
        assert result["mean"] == 3.0
        assert result["median"] == 3.0
        assert result["min"] == 1
        assert result["max"] == 5
        assert result["std"] is not None
        assert result["sum"] == 15

    def test_even_count_median(self):
        result = NumericAggregator().aggregate([1, 2, 3, 4])
        assert result["median"] == 2.5

    def test_population_std(self):
        result = NumericAggregator().aggregate([1, 1, 1, 1])
        assert result["std"] == 0.0

    def test_empty_values(self):
        result = NumericAggregator().aggregate([])
        assert result["count"] == 0
        assert result["mean"] is None

    def test_non_numeric_values_skipped(self):
        values = [1, 2, "three", None, 5]
        result = NumericAggregator().aggregate(values)
        assert result["count"] == 3


class TestBooleanAggregator:
    def test_mixed_values(self):
        values = [True, False, True, True]
        result = BooleanAggregator().aggregate(values)
        assert result["count"] == 4
        assert result["true"]["count"] == 3
        assert result["true"]["percentage"] == 75.0
        assert result["false"]["count"] == 1
        assert result["false"]["percentage"] == 25.0

    def test_all_true(self):
        result = BooleanAggregator().aggregate([True, True])
        assert result["true"]["count"] == 2
        assert result["false"]["count"] == 0

    def test_empty_values(self):
        result = BooleanAggregator().aggregate([])
        assert result["count"] == 0
        assert result["true"]["percentage"] is None


class TestAggregatorsRegistry:
    def test_all_modes_registered(self):
        assert "distribution" in AGGREGATORS
        assert "numeric_summary" in AGGREGATORS
        assert "boolean_summary" in AGGREGATORS
        assert isinstance(AGGREGATORS["distribution"], DistributionAggregator)
        assert isinstance(AGGREGATORS["numeric_summary"], NumericAggregator)
        assert isinstance(AGGREGATORS["boolean_summary"], BooleanAggregator)
