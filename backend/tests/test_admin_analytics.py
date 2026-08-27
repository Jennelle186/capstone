from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.services.admin_analytics.aggregators import (
    AGGREGATORS,
    BooleanAggregator,
    BucketizedAggregator,
    DistributionAggregator,
    NumericAggregator,
    infer_mode,
)
from app.services.admin_analytics.alignment import build_alignment_report
from app.services.admin_analytics.field_values import extract_values


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
        assert labels["Male"] == 3
        assert labels["Female"] == 2

    def test_multi_select(self):
        values = [
            ["visayan", "tagalog"],
            ["visayan"],
            ["tagalog", "zamboangueno"],
        ]
        result = DistributionAggregator().aggregate(values)
        assert result["student_count"] == 3
        assert len(result["distribution"]) == 3

    def test_merged_options_from_multiple_schemas(self):
        merged_options = [
            {"value": "male", "label": "Male"},
            {"value": "female", "label": "Female"},
            {"value": "non_binary", "label": "Non-Binary"},
        ]
        values = ["male", "female", "non_binary", "male"]
        result = DistributionAggregator().aggregate(values, options=merged_options)
        assert result["student_count"] == 4
        labels = {d["label"]: d["count"] for d in result["distribution"]}
        assert labels["Male"] == 2
        assert labels["Female"] == 1
        assert labels["Non-Binary"] == 1

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

    def test_accepts_string_true(self):
        values = ["true", True, "false"]
        result = BooleanAggregator().aggregate(values)
        assert result["count"] == 3
        assert result["true"]["count"] == 2
        assert result["false"]["count"] == 1

    def test_accepts_string_yes_no(self):
        values = ["yes", "no", True]
        result = BooleanAggregator().aggregate(values)
        assert result["count"] == 3
        assert result["true"]["count"] == 2
        assert result["false"]["count"] == 1


class TestAggregatorsRegistry:
    def test_all_modes_registered(self):
        assert "distribution" in AGGREGATORS
        assert "numeric_summary" in AGGREGATORS
        assert "boolean_summary" in AGGREGATORS
        assert "bucketized" in AGGREGATORS
        assert isinstance(AGGREGATORS["distribution"], DistributionAggregator)
        assert isinstance(AGGREGATORS["numeric_summary"], NumericAggregator)
        assert isinstance(AGGREGATORS["boolean_summary"], BooleanAggregator)
        assert isinstance(AGGREGATORS["bucketized"], BucketizedAggregator)


class TestBucketizedAggregator:
    def test_basic_buckets(self):
        values = [1, 2, 5, 8, 15, 25]
        buckets = [
            {"label": "Low", "min": 0, "max": 10},
            {"label": "Medium", "min": 10, "max": 20},
            {"label": "High", "min": 20, "max": 30},
        ]
        result = BucketizedAggregator().aggregate(values, buckets=buckets)
        assert result["student_count"] == 6
        labels = {d["label"]: d["count"] for d in result["distribution"]}
        assert labels["Low"] == 4
        assert labels["Medium"] == 1
        assert labels["High"] == 1

    def test_value_above_last_bucket_max(self):
        values = [5, 50]
        buckets = [
            {"label": "Low", "min": 0, "max": 10},
            {"label": "High", "min": 10, "max": 30},
        ]
        result = BucketizedAggregator().aggregate(values, buckets=buckets)
        labels = {d["label"]: d["count"] for d in result["distribution"]}
        # 50 is >= 30 so it lands in the last bucket
        assert labels["High"] == 1

    def test_non_numeric_values_skipped(self):
        values = [1, "abc", None, 5]
        buckets = [{"label": "Range", "min": 0, "max": 10}]
        result = BucketizedAggregator().aggregate(values, buckets=buckets)
        assert sum(d["count"] for d in result["distribution"]) == 2

    def test_empty_values(self):
        result = BucketizedAggregator().aggregate([], buckets=[{"label": "A", "min": 0, "max": 10}])
        assert result["student_count"] == 0
        assert all(d["count"] == 0 for d in result["distribution"])

    def test_no_buckets_provided(self):
        result = BucketizedAggregator().aggregate([1, 2, 3])
        assert result["distribution"] == []
        assert result["student_count"] == 0


class TestExtractValues:
    def _make_submission(self, extracted_data: dict | None):
        sub = MagicMock()
        sub.extracted_data = extracted_data
        return sub

    def test_extracts_by_field_id(self):
        subs = [self._make_submission({"field_1": {"value": "hello"}})]
        result = extract_values(subs, "field_1", "string")
        assert result == ["hello"]

    def test_falls_back_to_field_key(self):
        subs = [self._make_submission({"key_1": {"value": "fallback"}})]
        result = extract_values(subs, "field_1", "string", field_key="key_1")
        assert result == ["fallback"]

    def test_skips_missing_field(self):
        subs = [self._make_submission({"other": {"value": "x"}})]
        result = extract_values(subs, "field_1", "string")
        assert result == []

    def test_skips_null_entry(self):
        subs = [self._make_submission({"field_1": None})]
        result = extract_values(subs, "field_1", "string")
        assert result == []

    def test_skips_null_value(self):
        subs = [self._make_submission({"field_1": {"value": None}})]
        result = extract_values(subs, "field_1", "string")
        assert result == []

    def test_multi_select_preserves_list(self):
        subs = [self._make_submission({"field_1": {"value": ["a", "b"]}})]
        result = extract_values(subs, "field_1", "multi-select")
        assert result == [["a", "b"]]

    def test_number_coerces_to_float(self):
        subs = [self._make_submission({"field_1": {"value": "42.5"}})]
        result = extract_values(subs, "field_1", "number")
        assert result == [42.5]

    def test_number_skips_unparseable(self):
        subs = [self._make_submission({"field_1": {"value": "not_a_number"}})]
        result = extract_values(subs, "field_1", "number")
        assert result == []

    def test_multiple_submissions(self):
        subs = [
            self._make_submission({"f": {"value": "a"}}),
            self._make_submission({"f": {"value": "b"}}),
            self._make_submission({"f": {"value": "c"}}),
        ]
        result = extract_values(subs, "f", "string")
        assert result == ["a", "b", "c"]

    def test_raw_value_not_dict(self):
        subs = [self._make_submission({"field_1": "raw_string"})]
        result = extract_values(subs, "field_1", "string")
        assert result == ["raw_string"]

    def test_empty_submissions(self):
        result = extract_values([], "field_1", "string")
        assert result == []

    def test_strips_string_values(self):
        subs = [self._make_submission({"field_1": {"value": "  male  "}})]
        result = extract_values(subs, "field_1", "string")
        assert result == ["male"]

    def test_normalizes_boolean_string_true(self):
        subs = [self._make_submission({"field_1": {"value": "true"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [True]

    def test_normalizes_boolean_string_false(self):
        subs = [self._make_submission({"field_1": {"value": "false"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [False]

    def test_normalizes_boolean_string_yes(self):
        subs = [self._make_submission({"field_1": {"value": "yes"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [True]

    def test_normalizes_boolean_string_no(self):
        subs = [self._make_submission({"field_1": {"value": "no"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [False]

    def test_normalizes_boolean_string_one(self):
        subs = [self._make_submission({"field_1": {"value": "1"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [True]

    def test_normalizes_boolean_string_zero(self):
        subs = [self._make_submission({"field_1": {"value": "0"}})]
        result = extract_values(subs, "field_1", "boolean")
        assert result == [False]


class TestBuildAlignmentReport:
    def _field(self, key="gender", canonical_key="gender", field_type="select", options=None, label=None):
        field = {"key": key, "type": field_type, "is_analytics": True, "canonical_key": canonical_key}
        if label is not None:
            field["analytics_label"] = label
        if options is not None:
            field["options"] = options
        return field

    def _schema(self, schema_id, name, fields):
        return {"id": schema_id, "name": name, "fields": fields}

    def test_aligned_group_across_two_years(self):
        schemas = [
            self._schema("s1", "Enrollment 2024", [self._field()]),
            self._schema("s2", "Enrollment 2026", [self._field()]),
        ]
        year_names = {"s1": ["2023-2024"], "s2": ["2026-2027"]}
        report = build_alignment_report(schemas, year_names)
        assert report["total_keys"] == 1
        assert report["isolated_keys"] == 0
        assert report["diverged_keys"] == 0
        group = report["groups"][0]
        assert group["status"] == "aligned"
        assert group["school_year_count"] == 2
        assert group["school_year_names"] == ["2023-2024", "2026-2027"]

    def test_isolated_single_year(self):
        schemas = [self._schema("s1", "Enrollment 2024", [self._field()])]
        report = build_alignment_report(schemas, {"s1": ["2023-2024"]})
        assert report["isolated_keys"] == 1
        assert report["groups"][0]["status"] == "isolated"

    def test_diverges_on_field_type(self):
        schemas = [
            self._schema("s1", "Enrollment 2024", [self._field(field_type="string")]),
            self._schema("s2", "Enrollment 2026", [self._field(field_type="select")]),
        ]
        year_names = {"s1": ["2023-2024"], "s2": ["2026-2027"]}
        report = build_alignment_report(schemas, year_names)
        group = report["groups"][0]
        assert group["status"] == "diverges"
        assert report["diverged_keys"] == 1
        assert any("field_type differs" in d for d in group["divergences"])

    def test_diverges_on_options(self):
        opts_a = [{"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}]
        opts_b = [{"value": "male", "label": "Male"}, {"value": "female", "label": "Female"}, {"value": "non_binary", "label": "Non-Binary"}]
        schemas = [
            self._schema("s1", "Enrollment 2024", [self._field(options=opts_a)]),
            self._schema("s2", "Enrollment 2026", [self._field(options=opts_b)]),
        ]
        year_names = {"s1": ["2023-2024"], "s2": ["2026-2027"]}
        report = build_alignment_report(schemas, year_names)
        group = report["groups"][0]
        assert group["status"] == "diverges"
        assert "options differ" in group["divergences"]

    def test_falls_back_to_field_key(self):
        schemas = [self._schema("s1", "Enrollment 2024", [self._field(canonical_key=None)])]
        report = build_alignment_report(schemas, {"s1": ["2023-2024"]})
        assert report["groups"][0]["canonical_key"] == "gender"

    def test_skips_non_analytics_fields(self):
        non_analytics = {"key": "notes", "type": "string", "is_analytics": False}
        schemas = [self._schema("s1", "Enrollment 2024", [non_analytics])]
        report = build_alignment_report(schemas, {"s1": ["2023-2024"]})
        assert report["total_keys"] == 0

    def test_skips_fields_with_no_key_and_no_canonical_key(self):
        field = {"key": "", "type": "string", "is_analytics": True, "canonical_key": None}
        schemas = [self._schema("s1", "Enrollment 2024", [field])]
        report = build_alignment_report(schemas, {"s1": ["2023-2024"]})
        assert report["total_keys"] == 0

    def test_empty_schemas(self):
        report = build_alignment_report([], {})
        assert report == {"groups": [], "total_keys": 0, "isolated_keys": 0, "diverged_keys": 0}
