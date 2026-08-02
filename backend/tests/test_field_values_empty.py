from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.admin_analytics.aggregators import DistributionAggregator
from app.services.admin_analytics.field_values import extract_values


def _make_submission(extracted_data):
    sub = MagicMock()
    sub.extracted_data = extracted_data
    return sub


class TestExtractValuesEmpty:
    """Tests that ``extract_values`` correctly skips empty / null values.

    These complement the existing tests in ``test_admin_analytics.py`` by
    covering the empty-string and empty-list branches that the current test
    suite doesn't exercise.
    """

    # ── test_empty_string_treated_as_missing ───────────────────────
    # When extracted_data has value: "", it is NOT counted in values_present.

    def test_empty_string_treated_as_missing(self):
        subs = [_make_submission({"field_1": {"value": ""}})]
        result = extract_values(subs, "field_1", "string")
        assert result == []

    # ── test_empty_list_treated_as_missing ─────────────────────────
    # When extracted_data has value: [] (empty list, multi-select with no
    # selections), it is NOT counted.

    def test_empty_list_treated_as_missing(self):
        subs = [_make_submission({"field_1": {"value": []}})]
        result = extract_values(subs, "field_1", "multi-select")
        assert result == []

    # ── test_none_treated_as_missing ───────────────────────────────
    # When value is None, it is skipped.

    def test_none_treated_as_missing(self):
        subs = [_make_submission({"field_1": {"value": None}})]
        result = extract_values(subs, "field_1", "string")
        assert result == []

    # ── test_non_empty_string_counted ──────────────────────────────
    # When value is "Freshman", it IS counted.

    def test_non_empty_string_counted(self):
        subs = [_make_submission({"field_1": {"value": "Freshman"}})]
        result = extract_values(subs, "field_1", "string")
        assert result == ["Freshman"]

    # ── test_empty_string_not_in_distribution ──────────────────────
    # Distribution should not include "": 0 entries.  An empty string is
    # skipped by ``extract_values``, so the downstream aggregator never
    # sees it.

    def test_empty_string_not_in_distribution(self):
        subs = [
            _make_submission({"field_1": {"value": "Male"}}),
            _make_submission({"field_1": {"value": ""}}),
            _make_submission({"field_1": {"value": "Female"}}),
        ]
        result = extract_values(subs, "field_1", "string")
        distribution = DistributionAggregator().aggregate(result)
        labels = {d["label"]: d["count"] for d in distribution["distribution"]}
        assert "" not in labels
        assert labels.get("Male") == 1
        assert labels.get("Female") == 1
        assert distribution["student_count"] == 2

    # ── test_empty_list_not_in_multi_select_distribution ───────────
    # Same guarantee for empty lists in multi-select fields.

    def test_empty_list_not_in_multi_select_distribution(self):
        subs = [
            _make_submission({"field_1": {"value": ["a", "b"]}}),
            _make_submission({"field_1": {"value": []}}),
            _make_submission({"field_1": {"value": ["c"]}}),
        ]
        result = extract_values(subs, "field_1", "multi-select")
        distribution = DistributionAggregator().aggregate(result)
        assert distribution["student_count"] == 2

    # ── test_mixed_empty_and_valid_values ──────────────────────────
    # Ensure that a mix of valid and empty values only returns the valid ones.

    def test_mixed_empty_and_valid_values(self):
        subs = [
            _make_submission({"field_1": {"value": "valid"}}),
            _make_submission({"field_1": {"value": ""}}),
            _make_submission({"field_1": {"value": None}}),
            _make_submission({"field_1": {"value": "also_valid"}}),
        ]
        result = extract_values(subs, "field_1", "string")
        assert result == ["valid", "also_valid"]
