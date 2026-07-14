from __future__ import annotations

from unittest.mock import MagicMock

from app.services.admin_analytics.field_values import extract_values


class TestSourceKeyFallback:
    def _make_submission(self, extracted_data: dict | None):
        sub = MagicMock()
        sub.extracted_data = extracted_data
        return sub

    def test_source_key_scan_finds_value_when_id_and_key_miss(self):
        """Data stored under old UUID with source_key should be found."""
        subs = [self._make_submission({
            "old-uuid-abc": {"value": "male", "source_key": "gender", "confidence": 1.0},
        })]
        result = extract_values(subs, "new-uuid-xyz", "string", field_key="gender")
        assert result == ["male"]

    def test_source_key_scan_skipped_when_id_matches(self):
        """Direct field_id match short-circuits; source_key scan not reached."""
        subs = [self._make_submission({
            "new-uuid-xyz": {"value": "male", "source_key": "gender", "confidence": 1.0},
        })]
        result = extract_values(subs, "new-uuid-xyz", "string", field_key="gender")
        assert result == ["male"]

    def test_source_key_scan_skips_non_dict_entries(self):
        """Raw string values have no .get('source_key') — should be skipped."""
        subs = [self._make_submission({"old-uuid": "raw_string"})]
        result = extract_values(subs, "new-id", "string", field_key="gender")
        assert result == []

    def test_source_key_scan_multiple_submissions(self):
        """Only the submission with matching source_key should contribute."""
        subs = [
            self._make_submission({"other": {"value": "x"}}),
            self._make_submission({
                "old-uuid": {"value": "matched", "source_key": "gender"},
            }),
            self._make_submission({"unrelated": {"value": "y"}}),
        ]
        result = extract_values(subs, "new-id", "string", field_key="gender")
        assert result == ["matched"]
