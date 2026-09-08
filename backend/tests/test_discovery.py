from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.admin_analytics.discovery import get_canonical_keys
from app.services.admin_analytics.registry import get_registry_metadata


def _make_dimension(**overrides):
    defaults = {
        "id": uuid4(),
        "canonical_key": "shs_strand",
        "label": "SHS Strand",
        "field_type": "select",
        "analytics_group": "High School Statistics",
        "is_active": True,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_schema(schema_id, fields):
    return SimpleNamespace(id=schema_id, fields_json=fields)


def _make_syr(schema_id, document_type_id, school_year_id):
    return SimpleNamespace(
        id=uuid4(),
        extraction_schema_id=schema_id,
        document_type_id=document_type_id,
        school_year_id=school_year_id,
    )


def _make_doc_type(doc_type_id, name):
    return SimpleNamespace(id=doc_type_id, name=name)


def _result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _db_with_results(*results):
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=list(results))
    return session


class TestGetCanonicalKeys:
    @pytest.mark.asyncio
    async def test_registry_metadata_wins_over_schema(self):
        dim = _make_dimension(
            canonical_key="shs_strand",
            label="Registry Label",
            field_type="select",
        )
        schema = _make_schema(
            uuid4(),
            [
                {
                    "key": "shs_strand",
                    "canonical_key": "shs_strand",
                    "is_analytics": True,
                    "analytics_label": "Schema Label",
                    "type": "string",
                }
            ],
        )
        db = _db_with_results(
            _result([dim]),
            _result([schema]),
            _result([]),
        )

        keys = await get_canonical_keys(db)

        assert len(keys) == 1
        assert keys[0]["label"] == "Registry Label"
        assert keys[0]["field_type"] == "select"

    @pytest.mark.asyncio
    async def test_unregistered_keys_are_excluded(self):
        dim = _make_dimension(canonical_key="shs_strand")
        schema = _make_schema(
            uuid4(),
            [
                {
                    "key": "shs_strand",
                    "canonical_key": "shs_strand",
                    "is_analytics": True,
                },
                {
                    "key": "not_registered",
                    "canonical_key": "not_registered",
                    "is_analytics": True,
                },
            ],
        )
        db = _db_with_results(
            _result([dim]),
            _result([schema]),
            _result([]),
        )

        keys = await get_canonical_keys(db)

        assert [k["canonical_key"] for k in keys] == ["shs_strand"]

    @pytest.mark.asyncio
    async def test_computes_school_year_count_and_document_types(self):
        dim = _make_dimension(canonical_key="shs_strand")
        schema_a = _make_schema(
            uuid4(),
            [{"key": "shs_strand", "canonical_key": "shs_strand", "is_analytics": True}],
        )
        schema_b = _make_schema(
            uuid4(),
            [{"key": "shs_strand", "canonical_key": "shs_strand", "is_analytics": True}],
        )
        dt1 = uuid4()
        dt2 = uuid4()
        sy1 = uuid4()
        sy2 = uuid4()
        sy3 = uuid4()

        syr1 = _make_syr(schema_a.id, dt1, sy1)
        syr2 = _make_syr(schema_a.id, dt1, sy2)
        syr3 = _make_syr(schema_b.id, dt2, sy3)

        doc_type1 = _make_doc_type(dt1, "Student Info")
        doc_type2 = _make_doc_type(dt2, "Report Card")

        db = _db_with_results(
            _result([dim]),
            _result([schema_a, schema_b]),
            _result([syr1, syr2, syr3]),
            _result([doc_type1, doc_type2]),
        )

        keys = await get_canonical_keys(db)

        assert len(keys) == 1
        assert keys[0]["school_year_count"] == 3
        assert keys[0]["document_types"] == ["Report Card", "Student Info"]

    @pytest.mark.asyncio
    async def test_inactive_dimensions_are_filtered_in_query(self):
        active = _make_dimension(canonical_key="active_key", is_active=True)

        db = _db_with_results(
            _result([active]),
            _result([]),
            _result([]),
        )

        keys = await get_canonical_keys(db)

        assert [k["canonical_key"] for k in keys] == ["active_key"]

        # The WHERE clause must filter out inactive rows.
        stmt = db.execute.await_args_list[0].args[0]
        compiled = str(stmt.compile())
        assert "is_active" in compiled

    @pytest.mark.asyncio
    async def test_case_insensitive_key_matching(self):
        dim = _make_dimension(canonical_key="Shs_Strand")
        schema = _make_schema(
            uuid4(),
            [
                {
                    "key": "shs_strand",
                    "canonical_key": "SHS_STRAND",
                    "is_analytics": True,
                }
            ],
        )
        db = _db_with_results(
            _result([dim]),
            _result([schema]),
            _result([]),
        )

        keys = await get_canonical_keys(db)

        assert len(keys) == 1
        assert keys[0]["canonical_key"] == "Shs_Strand"

    @pytest.mark.asyncio
    async def test_logs_warning_for_unregistered_key(self, caplog):
        dim = _make_dimension(canonical_key="shs_strand")
        schema = _make_schema(
            uuid4(),
            [
                {
                    "key": "orphan_key",
                    "canonical_key": "orphan_key",
                    "is_analytics": True,
                }
            ],
        )
        db = _db_with_results(
            _result([dim]),
            _result([schema]),
            _result([]),
        )

        with caplog.at_level(logging.WARNING):
            await get_canonical_keys(db)

        assert any("orphan_key" in rec.message for rec in caplog.records)

    @pytest.mark.asyncio
    async def test_no_schema_usage_still_returns_registry_key(self):
        dim = _make_dimension(canonical_key="shs_strand")

        db = _db_with_results(
            _result([dim]),
            _result([]),
            _result([]),
        )

        keys = await get_canonical_keys(db)

        assert len(keys) == 1
        assert keys[0]["school_year_count"] == 0
        assert keys[0]["document_types"] == []


class TestGetRegistryMetadata:
    @pytest.mark.asyncio
    async def test_returns_label_group_and_type_lookup(self):
        dim = _make_dimension(
            canonical_key="shs_strand",
            label="SHS Strand",
            field_type="select",
            analytics_group="High School Statistics",
        )
        db = _db_with_results(_result([dim]))

        meta = await get_registry_metadata(db)

        assert meta["shs_strand"]["label"] == "SHS Strand"
        assert meta["shs_strand"]["field_type"] == "select"
        assert meta["shs_strand"]["analytics_group"] == "High School Statistics"

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_dimensions(self):
        db = _db_with_results(_result([]))

        meta = await get_registry_metadata(db)

        assert meta == {}
