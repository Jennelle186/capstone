from __future__ import annotations

from app.utils.computation import apply_computed_fields


class TestApplyComputedFields:
    def _schema_fields(self, **overrides):
        base = {
            "s1": {"id": "s1", "key": "sem1", "type": "number"},
            "s2": {"id": "s2", "key": "sem2", "type": "number"},
            "s3": {"id": "s3", "key": "sem3", "type": "number"},
            "avg": {
                "id": "avg",
                "key": "overall",
                "type": "number",
                "is_computed": True,
                "computation": {"operation": "average", "dependencies": ["s1", "s2"]},
                **overrides,
            },
        }
        return list(base.values())

    def _data(self, s1=None, s2=None):
        d = {}
        if s1 is not None:
            d["s1"] = {"value": str(s1), "confidence": 0.9, "source_key": "sem1"}
        if s2 is not None:
            d["s2"] = {"value": str(s2), "confidence": 0.9, "source_key": "sem2"}
        return d

    def test_average_two_deps(self):
        result = apply_computed_fields(self._schema_fields(), self._data(90, 80))
        assert result["avg"]["value"] == "85.0"

    def test_sum_operation(self):
        fields = self._schema_fields(
            computation={"operation": "sum", "dependencies": ["s1", "s2", "s3"]}
        )
        data = {"s1": {"value": "10"}, "s2": {"value": "20"}, "s3": {"value": "30"}}
        result = apply_computed_fields(fields, data)
        assert result["avg"]["value"] == "60.0"

    def test_max_operation(self):
        fields = self._schema_fields(
            computation={"operation": "max", "dependencies": ["s1", "s2"]}
        )
        result = apply_computed_fields(fields, self._data(10, 50))
        assert result["avg"]["value"] == "50.0"

    def test_min_operation(self):
        fields = self._schema_fields(
            computation={"operation": "min", "dependencies": ["s1", "s2"]}
        )
        result = apply_computed_fields(fields, self._data(10, 50))
        assert result["avg"]["value"] == "10.0"

    def test_missing_dependency_skipped(self):
        """Only s1 has a value; s2 is None — should be excluded from the average."""
        result = apply_computed_fields(self._schema_fields(), self._data(90, None))
        assert result["avg"]["value"] == "90.0"

    def test_non_numeric_dependency_skipped(self):
        """s1 is non-numeric; s2 is valid. Only s2 contributes."""
        result = apply_computed_fields(self._schema_fields(), self._data("abc", 80))
        assert result["avg"]["value"] == "80.0"

    def test_all_deps_missing(self):
        """No dependencies have values — computed field should not be added."""
        fields = self._schema_fields()
        data = {}
        result = apply_computed_fields(fields, data)
        assert "avg" not in result

    def test_no_computed_fields_passthrough(self):
        """If no field has is_computed=True, the data dict passes through unchanged."""
        fields = [{"id": "x", "key": "x", "type": "string"}]
        data = {"x": {"value": "hello"}}
        result = apply_computed_fields(fields, data)
        assert result == data

    def test_result_metadata(self):
        """Computed values should carry metadata flags."""
        result = apply_computed_fields(self._schema_fields(), self._data(90, 80))
        entry = result["avg"]
        assert entry["is_computed"] is True
        assert entry["confidence"] == 1.0
        assert entry["needs_review"] is False
        assert entry["source_key"] == "[computed]"
