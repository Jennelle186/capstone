from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.admin_analytics.alignment import get_alignment_report
from app.services.admin_analytics.registry import get_registry_metadata
from app.services.admin_analytics.snapshot import get_extraction_analytics
from app.services.admin_analytics.trends import get_trends


def _make_dimension(**overrides):
    defaults = {
        "id": uuid4(),
        "canonical_key": "gender",
        "label": "Student Gender",
        "field_type": "select",
        "analytics_group": "Student Information",
        "is_active": True,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_scalars_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _make_tuple_result(items):
    result = MagicMock()
    result.all.return_value = items
    return result


class TestRegistryCaseNormalization:
    @pytest.mark.asyncio
    async def test_get_registry_metadata_lowercases_keys(self):
        dim = _make_dimension(canonical_key="Shs_Strand")
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_make_scalars_result([dim])])

        meta = await get_registry_metadata(db)

        assert "shs_strand" in meta
        assert "Shs_Strand" not in meta
        assert meta["shs_strand"]["label"] == "Student Gender"

    @pytest.mark.asyncio
    async def test_snapshot_applies_curated_label_case_insensitive(self):
        sy_id = uuid4()
        schema_id = uuid4()
        doc_type_id = uuid4()

        sy = MagicMock()
        sy.id = sy_id
        sy.name = "2024-2025"

        schema = MagicMock()
        schema.id = schema_id
        schema.fields_json = [
            {
                "id": "gender-id",
                "key": "gender",
                "canonical_key": "gender",
                "type": "string",
                "is_analytics": True,
            }
        ]

        syr = MagicMock()
        syr.extraction_schema_id = schema_id
        syr.document_type_id = doc_type_id
        syr.snapshot_fields_json = None

        dim = _make_dimension(canonical_key="Gender", label="Student Gender")

        db = AsyncMock()
        db.get.side_effect = lambda model, rid: {sy_id: sy}.get(rid)
        db.execute = AsyncMock(
            side_effect=[
                _make_scalars_result([syr]),
                _make_scalars_result([syr]),
                _make_scalars_result([schema]),
                _make_scalars_result([]),
                _make_scalars_result([]),
                _make_scalars_result([dim]),
            ]
        )

        with patch(
            "app.services.admin_analytics.snapshot.get_bulk_student_slot_statuses",
            return_value={},
        ):
            result = await get_extraction_analytics(db, sy_id)

        field = next(
            (f for f in result["fields"] if f["canonical_key"] == "gender"), None
        )
        assert field is not None
        assert field["label"] == "Student Gender"

    @pytest.mark.asyncio
    async def test_trends_mixed_case_key_not_dropped(self):
        schema = MagicMock()
        schema.id = uuid4()
        schema.fields_json = [
            {
                "id": "gender-id",
                "key": "gender",
                "canonical_key": "gender",
                "type": "string",
                "is_analytics": True,
            }
        ]

        dim = _make_dimension(canonical_key="Gender", label="Student Gender")

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _make_scalars_result([schema]),
                _make_scalars_result([dim]),
                _make_scalars_result([]),
            ]
        )

        result = await get_trends(db, keys=["gender"], from_year=2024, to_year=2025)

        assert "gender" in result["canonical_keys"]
        assert result["canonical_keys"]["gender"]["label"] == "Student Gender"

    @pytest.mark.asyncio
    async def test_alignment_label_applied_case_insensitive(self):
        schema = MagicMock()
        schema.id = uuid4()
        schema.name = "Report Card"
        schema.fields_json = [
            {
                "id": "gender-id",
                "key": "gender",
                "canonical_key": "gender",
                "type": "select",
                "is_analytics": True,
            }
        ]

        syr = MagicMock()
        syr.extraction_schema_id = schema.id

        dim = _make_dimension(canonical_key="Gender", label="Student Gender")

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _make_scalars_result([schema]),
                _make_tuple_result([(syr, "2024-2025")]),
                _make_scalars_result([dim]),
            ]
        )

        report = await get_alignment_report(db)

        assert report["total_keys"] == 1
        assert report["groups"][0]["canonical_key"] == "gender"
        assert report["groups"][0]["label"] == "Student Gender"