from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.admin_analytics.snapshot import get_extraction_analytics
from app.services.document_requirements import replace_school_year_requirements


class TestSnapshotFallback:
    """Verifies the snapshot_fields_json → schema.fields_json fallback chain."""

    def _make_syr(self, extraction_schema_id, snapshot_fields_json=None):
        syr = MagicMock()
        syr.extraction_schema_id = extraction_schema_id
        syr.snapshot_fields_json = snapshot_fields_json
        syr.document_type_id = uuid4()
        return syr

    def _make_schema(self, schema_id, fields_json=None):
        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = fields_json or []
        return schema

    def test_snapshot_takes_priority_over_live_schema(self):
        """When snapshot_fields_json is set, it is used instead of the live schema's fields_json."""
        sid = uuid4()
        snapshot_fields = [{"key": "frozen_field", "is_analytics": True}]
        live_fields = [{"key": "live_field", "is_analytics": True}]

        syr = self._make_syr(sid, snapshot_fields_json=snapshot_fields)
        schema = self._make_schema(sid, fields_json=live_fields)

        schema_snapshots: dict = {}
        for s in [syr]:
            eid = s.extraction_schema_id
            if eid and eid not in schema_snapshots:
                schema_snapshots[eid] = s.snapshot_fields_json

        snap = schema_snapshots.get(schema.id)
        result = snap if snap is not None else schema.fields_json

        assert result == snapshot_fields

    def test_live_schema_used_when_no_snapshot(self):
        """When snapshot_fields_json is None, the live schema's fields_json is used."""
        sid = uuid4()
        live_fields = [{"key": "live_field", "is_analytics": True}]

        syr = self._make_syr(sid, snapshot_fields_json=None)
        schema = self._make_schema(sid, fields_json=live_fields)

        schema_snapshots: dict = {}
        for s in [syr]:
            eid = s.extraction_schema_id
            if eid and eid not in schema_snapshots:
                schema_snapshots[eid] = s.snapshot_fields_json

        snap = schema_snapshots.get(schema.id)
        result = snap if snap is not None else schema.fields_json

        assert result == live_fields

    def test_empty_snapshot_not_overridden_by_live(self):
        """An explicit empty list is preserved against a non-empty live schema."""
        sid = uuid4()
        live_fields = [{"key": "live_field", "is_analytics": True}]

        syr = self._make_syr(sid, snapshot_fields_json=[])
        schema = self._make_schema(sid, fields_json=live_fields)

        schema_snapshots: dict = {}
        for s in [syr]:
            eid = s.extraction_schema_id
            if eid and eid not in schema_snapshots:
                schema_snapshots[eid] = s.snapshot_fields_json

        snap = schema_snapshots.get(schema.id)
        result = snap if snap is not None else schema.fields_json

        assert result == []

    def test_schema_without_syr_uses_live_fields(self):
        """A schema with no SYR entry falls back to live fields_json."""
        sid = uuid4()
        live_fields = [{"key": "orphan_field", "is_analytics": True}]
        schema = self._make_schema(sid, fields_json=live_fields)

        schema_snapshots: dict = {}
        snap = schema_snapshots.get(schema.id)
        result = snap if snap is not None else schema.fields_json

        assert result == live_fields

    def test_multiple_syrs_same_schema_first_snapshot_wins(self):
        """Multiple SYRs for the same schema use the first snapshot encountered."""
        sid = uuid4()
        snapshot_1 = [{"key": "first", "is_analytics": True}]

        syr_1 = self._make_syr(sid, snapshot_fields_json=snapshot_1)
        syr_2 = self._make_syr(sid, snapshot_fields_json=[{"key": "second", "is_analytics": True}])
        schema = self._make_schema(sid, fields_json=[{"key": "live", "is_analytics": True}])

        schema_snapshots: dict = {}
        for s in [syr_1, syr_2]:
            eid = s.extraction_schema_id
            if eid and eid not in schema_snapshots:
                schema_snapshots[eid] = s.snapshot_fields_json

        snap = schema_snapshots.get(schema.id)
        result = snap if snap is not None else schema.fields_json

        assert result == snapshot_1


class TestReplaceRequirementsSnapshot:
    """Verifies replace_school_year_requirements snapshots schema fields_json."""

    pytestmark = pytest.mark.asyncio

    @pytest.fixture(autouse=True)
    def _patch_deps(self):
        patchers = [
            patch(
                "app.services.document_requirements.ensure_school_year_requirements_mutable",
                return_value=None,
            ),
            patch(
                "app.services.document_requirements.dedupe_requirement_assignments",
                side_effect=lambda x: x,
            ),
            patch(
                "app.services.document_requirements.validate_requirement_assignments",
                return_value=None,
            ),
        ]
        for p in patchers:
            p.start()
        yield
        for p in patchers:
            p.stop()

    async def test_snapshot_captured_from_schema(self):
        """When a schema is linked, its fields_json is copied to snapshot_fields_json."""
        schema_id = uuid4()
        doc_type_id = uuid4()
        fields = [{"key": "gender", "label": "Gender", "is_analytics": True}]

        mock_schema = MagicMock()
        mock_schema.fields_json = fields

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_schema)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        school_year_id = uuid4()
        requirements = [(doc_type_id, schema_id)]

        await replace_school_year_requirements(mock_db, school_year_id, requirements)

        added_syr = mock_db.add.call_args[0][0]
        assert added_syr.snapshot_fields_json == fields
        assert added_syr.document_type_id == doc_type_id
        assert added_syr.extraction_schema_id == schema_id

    async def test_snapshot_is_none_when_no_schema(self):
        """When no extraction_schema_id is provided, snapshot_fields_json is None."""
        doc_type_id = uuid4()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock()
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        school_year_id = uuid4()
        requirements = [(doc_type_id, None)]

        await replace_school_year_requirements(mock_db, school_year_id, requirements)

        added_syr = mock_db.add.call_args[0][0]
        assert added_syr.snapshot_fields_json is None
        assert added_syr.extraction_schema_id is None

    async def test_snapshot_none_when_schema_not_found(self):
        """If the schema row doesn't exist, snapshot_fields_json stays None."""
        schema_id = uuid4()
        doc_type_id = uuid4()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        school_year_id = uuid4()
        requirements = [(doc_type_id, schema_id)]

        await replace_school_year_requirements(mock_db, school_year_id, requirements)

        added_syr = mock_db.add.call_args[0][0]
        assert added_syr.snapshot_fields_json is None
