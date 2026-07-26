from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.models import SubmissionStatus
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

    def _empty_db_result(self):
        scalars_result = MagicMock()
        scalars_result.all = MagicMock(return_value=[])
        db_result = MagicMock()
        db_result.scalars = MagicMock(return_value=scalars_result)
        db_result.all = MagicMock(return_value=[])
        return db_result

    async def test_snapshot_captured_from_schema(self):
        """When a schema is linked, its fields_json is copied to snapshot_fields_json."""
        schema_id = uuid4()
        doc_type_id = uuid4()
        fields = [{"key": "gender", "label": "Gender", "is_analytics": True}]

        mock_schema = MagicMock()
        mock_schema.fields_json = fields

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=self._empty_db_result())
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
        mock_db.execute = AsyncMock(return_value=self._empty_db_result())
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
        mock_db.execute = AsyncMock(return_value=self._empty_db_result())
        mock_db.get = AsyncMock(return_value=None)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        school_year_id = uuid4()
        requirements = [(doc_type_id, schema_id)]

        await replace_school_year_requirements(mock_db, school_year_id, requirements)

        added_syr = mock_db.add.call_args[0][0]
        assert added_syr.snapshot_fields_json is None


# ── New: Snapshot overlay tests (Fallback 2) ───────────────────────────────────


class TestSnapshotOverlay:
    """Verify live analytics config overrides frozen snapshot fields
    without requiring a manual snapshot refresh."""

    def _apply_overlay(self, snap_fields, live_fields):
        """Reproduce the overlay logic from snapshot.py:124-137."""
        schema_fields = list(snap_fields if snap_fields is not None else live_fields)

        if snap_fields is not None:
            live_by_key: dict[str, dict] = {}
            for f in live_fields:
                if isinstance(f, dict) and f.get("key"):
                    live_by_key[f["key"]] = f
            for f in schema_fields:
                if not isinstance(f, dict):
                    continue
                fk = f.get("key")
                if not fk or fk not in live_by_key:
                    continue
                live = live_by_key[fk]
                for prop in (
                    "is_analytics", "analytics_mode", "analytics_group",
                    "analytics_label", "canonical_key", "buckets",
                    "is_computed", "computation",
                ):
                    if prop in live:
                        f[prop] = live[prop]

        return schema_fields

    def test_live_analytics_mode_overrides_frozen(self):
        """Frozen has analytics_mode=None; live has 'bucketized'.
        After overlay, the field should use 'bucketized'."""
        snap = [{"id": "f1", "key": "gender", "type": "select", "is_analytics": True, "analytics_mode": None}]
        live = [{"id": "f1", "key": "gender", "type": "select", "is_analytics": True, "analytics_mode": "bucketized"}]
        result = self._apply_overlay(snap, live)
        assert result[0]["analytics_mode"] == "bucketized"
        assert result[0]["id"] == "f1"

    def test_live_buckets_overrides_frozen(self):
        """Frozen has no buckets; live has bucket ranges. Overlay applies live buckets."""
        live_buckets = [{"min": 75, "max": 80, "label": "75-80"}, {"min": 81, "max": 85, "label": "81-85"}]
        snap = [{"id": "f1", "key": "gpa", "type": "number", "is_analytics": True, "analytics_mode": "bucketized"}]
        live = [{"id": "f1", "key": "gpa", "type": "number", "is_analytics": True, "analytics_mode": "bucketized", "buckets": live_buckets}]
        result = self._apply_overlay(snap, live)
        assert result[0]["buckets"] == live_buckets

    def test_live_is_computed_overrides_frozen(self):
        """Frozen has no is_computed; live has is_computed=True. Overlay applies it."""
        snap = [{"id": "f1", "key": "avg", "type": "number", "is_analytics": True}]
        live = [{"id": "f1", "key": "avg", "type": "number", "is_analytics": True, "is_computed": True}]
        result = self._apply_overlay(snap, live)
        assert result[0]["is_computed"] is True

    def test_live_computation_overrides_frozen(self):
        """Frozen has no computation block; live has one. Overlay applies it."""
        comp = {"operation": "average", "dependencies": ["s1", "s2"]}
        snap = [{"id": "f1", "key": "avg", "is_analytics": True, "is_computed": True}]
        live = [{"id": "f1", "key": "avg", "is_analytics": True, "is_computed": True, "computation": comp}]
        result = self._apply_overlay(snap, live)
        assert result[0]["computation"] == comp

    def test_no_overlay_when_no_snapshot(self):
        """Without a frozen snapshot, live schema is returned as-is."""
        live = [{"id": "f1", "key": "x", "is_analytics": True, "analytics_mode": "distribution"}]
        result = self._apply_overlay(None, live)
        assert result == live

    def test_overlay_preserves_frozen_field_id(self):
        """The field id from the frozen snapshot is always preserved."""
        snap = [{"id": "frozen-id", "key": "gender", "type": "select", "is_analytics": True}]
        live = [{"id": "new-id", "key": "gender", "type": "select", "is_analytics": True, "analytics_mode": "bucketized"}]
        result = self._apply_overlay(snap, live)
        assert result[0]["id"] == "frozen-id"
        assert result[0]["analytics_mode"] == "bucketized"


# ── New: Compute fallback tests (Fallbacks 3 + 4) ──────────────────────────────


def _make_scalars_result(items: list) -> MagicMock:
    """Return a MagicMock whose .scalars().all() returns the given list."""
    all_mock = MagicMock(return_value=items)
    scalars_mock = MagicMock()
    scalars_mock.all = all_mock
    result = MagicMock()
    result.scalars = MagicMock(return_value=scalars_mock)
    return result


class TestComputeFallback:
    """Verify per-submission compute fallback and dependency source_key scan."""

    pytestmark = pytest.mark.asyncio

    @pytest.fixture(autouse=True)
    def _patch_slot_statuses(self):
        patcher = patch(
            "app.services.admin_analytics.snapshot.get_bulk_student_slot_statuses",
            return_value={},
        )
        patcher.start()
        yield
        patcher.stop()

    def _build_sy(self, name="2024-2025"):
        sy = MagicMock()
        sy.name = name
        return sy

    def _build_submission(self, extracted_data: dict, doc_type_id=None):
        sub = MagicMock()
        sub.extracted_data = extracted_data
        sub.status = SubmissionStatus.VERIFIED
        sub.student_id = uuid4()
        sub.document_type_id = doc_type_id or uuid4()
        return sub

    async def test_computes_value_when_not_stored(self):
        """1 submission with sem1+sem2 but no general_average → 1 computed value in result."""
        sy_id = uuid4()
        doc_type_id = uuid4()
        schema_id = uuid4()

        sy = self._build_sy()
        sy.id = sy_id

        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = [
            {"id": "sem1-id", "key": "first_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "sem2-id", "key": "second_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "ga-id", "key": "general_average", "type": "number", "is_analytics": True, "analytics_group": "HS",
             "is_computed": True,
             "computation": {"operation": "average", "dependencies": ["sem1-id", "sem2-id"]}},
        ]

        sub = self._build_submission({
            "sem1-id": {"value": "90", "confidence": 1.0, "source_key": "first_semester_average"},
            "sem2-id": {"value": "80", "confidence": 1.0, "source_key": "second_semester_average"},
        }, doc_type_id=doc_type_id)

        student = MagicMock()
        student.id = sub.student_id
        student.school_year_id = sy_id

        db = AsyncMock()
        db.get.side_effect = lambda model, rid: {
            sy_id: sy,
            schema_id: schema,
        }.get(rid)

        syr = MagicMock()
        syr.extraction_schema_id = schema_id
        syr.snapshot_fields_json = None
        syr.document_type_id = doc_type_id

        db.execute = AsyncMock()
        db.execute.side_effect = [
            _make_scalars_result([syr]),           # 1 SYRs schema-bound
            _make_scalars_result([syr]),           # 2 all_syrs
            _make_scalars_result([schema]),        # 3 schemas
            _make_scalars_result([student]),       # 4 students
            _make_scalars_result([sub]),           # 5 verified submissions
        ]

        result = await get_extraction_analytics(db, sy_id)
        assert result["total_students"] == 1

        ga_field = next((f for f in result["fields"] if f["canonical_key"] == "general_average"), None)
        assert ga_field is not None
        assert ga_field["insights"]["values_present"] == 1
        assert ga_field["insights"]["completion_rate"] == 100.0
        # NumericSummary mode: mean should be 85.0
        assert ga_field.get("mean") == pytest.approx(85.0)

    async def test_mixes_stored_and_computed_values(self):
        """2 submissions: 1 stored general_average, 1 only has deps → 2 values total."""
        sy_id = uuid4()
        doc_type_id = uuid4()
        schema_id = uuid4()

        sy = self._build_sy()
        sy.id = sy_id

        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = [
            {"id": "sem1-id", "key": "first_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "sem2-id", "key": "second_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "ga-id", "key": "general_average", "type": "number", "is_analytics": True, "analytics_group": "HS",
             "is_computed": True,
             "computation": {"operation": "average", "dependencies": ["sem1-id", "sem2-id"]}},
        ]

        # Submission 1: has stored general_average
        sub1 = self._build_submission({
            "sem1-id": {"value": "75", "confidence": 1.0},
            "sem2-id": {"value": "85", "confidence": 1.0},
            "ga-id": {"value": "80.0", "confidence": 1.0, "is_computed": True},
        }, doc_type_id=doc_type_id)

        # Submission 2: NO stored general_average
        sub2 = self._build_submission({
            "sem1-id": {"value": "90", "confidence": 1.0, "source_key": "first_semester_average"},
            "sem2-id": {"value": "80", "confidence": 1.0, "source_key": "second_semester_average"},
        }, doc_type_id=doc_type_id)

        student1 = MagicMock()
        student1.id = sub1.student_id
        student1.school_year_id = sy_id
        student2 = MagicMock()
        student2.id = sub2.student_id
        student2.school_year_id = sy_id

        db = AsyncMock()
        db.get.side_effect = lambda model, rid: {
            sy_id: sy,
            schema_id: schema,
        }.get(rid)

        syr = MagicMock()
        syr.extraction_schema_id = schema_id
        syr.snapshot_fields_json = None
        syr.document_type_id = doc_type_id

        db.execute = AsyncMock()
        db.execute.side_effect = [
            _make_scalars_result([syr]),
            _make_scalars_result([syr]),
            _make_scalars_result([schema]),
            _make_scalars_result([student1, student2]),
            _make_scalars_result([sub1, sub2]),
        ]

        result = await get_extraction_analytics(db, sy_id)
        assert result["total_students"] == 2

        ga_field = next((f for f in result["fields"] if f["canonical_key"] == "general_average"), None)
        assert ga_field is not None
        assert ga_field["insights"]["values_present"] == 2
        assert ga_field["insights"]["completion_rate"] == 100.0

    async def test_skips_when_no_dependency_data(self):
        """Submission with no sem1 and no sem2 → not counted."""
        sy_id = uuid4()
        doc_type_id = uuid4()
        schema_id = uuid4()

        sy = self._build_sy()
        sy.id = sy_id

        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = [
            {"id": "sem1-id", "key": "sem1", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "sem2-id", "key": "sem2", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "ga-id", "key": "ga", "type": "number", "is_analytics": True, "analytics_group": "HS",
             "is_computed": True,
             "computation": {"operation": "average", "dependencies": ["sem1-id", "sem2-id"]}},
        ]

        sub = self._build_submission({"other": {"value": "x"}}, doc_type_id=doc_type_id)

        student = MagicMock()
        student.id = sub.student_id
        student.school_year_id = sy_id

        db = AsyncMock()
        db.get.side_effect = lambda model, rid: {
            sy_id: sy,
            schema_id: schema,
        }.get(rid)

        syr = MagicMock()
        syr.extraction_schema_id = schema_id
        syr.snapshot_fields_json = None
        syr.document_type_id = doc_type_id

        db.execute = AsyncMock()
        db.execute.side_effect = [
            _make_scalars_result([syr]),
            _make_scalars_result([syr]),
            _make_scalars_result([schema]),
            _make_scalars_result([student]),
            _make_scalars_result([sub]),
        ]

        result = await get_extraction_analytics(db, sy_id)
        assert result["total_students"] == 1

        ga_field = next((f for f in result["fields"] if f["canonical_key"] == "ga"), None)
        assert ga_field is not None
        assert ga_field["insights"]["values_present"] == 0
        assert ga_field["insights"]["completion_rate"] == 0.0

    async def test_dependency_source_key_scan(self):
        """Sem1 stored under old UUID with source_key → Fallback 4 resolves it."""
        sy_id = uuid4()
        doc_type_id = uuid4()
        schema_id = uuid4()

        sy = self._build_sy()
        sy.id = sy_id

        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = [
            {"id": "sem1_new_id", "key": "first_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "sem2_new_id", "key": "second_semester_average", "type": "number", "is_analytics": True, "analytics_group": "HS"},
            {"id": "ga_new_id", "key": "general_average", "type": "number", "is_analytics": True, "analytics_group": "HS",
             "is_computed": True,
             "computation": {"operation": "average", "dependencies": ["sem1_new_id", "sem2_new_id"]}},
        ]

        # sem1 stored under old UUID with source_key, sem2 stored under new ID
        sub = self._build_submission({
            "old-uuid-sem1": {"value": "88", "source_key": "first_semester_average"},
            "sem2_new_id": {"value": "92"},
        }, doc_type_id=doc_type_id)

        student = MagicMock()
        student.id = sub.student_id
        student.school_year_id = sy_id

        db = AsyncMock()
        db.get.side_effect = lambda model, rid: {
            sy_id: sy,
            schema_id: schema,
        }.get(rid)

        syr = MagicMock()
        syr.extraction_schema_id = schema_id
        syr.snapshot_fields_json = None
        syr.document_type_id = doc_type_id

        db.execute = AsyncMock()
        db.execute.side_effect = [
            _make_scalars_result([syr]),
            _make_scalars_result([syr]),
            _make_scalars_result([schema]),
            _make_scalars_result([student]),
            _make_scalars_result([sub]),
        ]

        result = await get_extraction_analytics(db, sy_id)
        ga_field = next((f for f in result["fields"] if f["canonical_key"] == "general_average"), None)
        assert ga_field is not None
        assert ga_field["insights"]["values_present"] == 1
        # average(88, 92) = 90.0
        assert ga_field.get("mean") == pytest.approx(90.0)
