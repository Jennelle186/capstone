from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.routers.public.privacy_info import get_privacy_info


def _school_year():
    return SimpleNamespace(
        id=uuid4(),
        name="2025-2026",
        start_date=date(2025, 6, 1),
        end_date=date(2026, 5, 31),
        status=SimpleNamespace(value="active"),
    )


def _doc_type(name, code, description):
    return SimpleNamespace(
        id=uuid4(),
        name=name,
        code=code,
        description=description,
    )


def _schema(fields_json):
    return SimpleNamespace(id=uuid4(), fields_json=fields_json)


def _item(doc_type, schema):
    return SimpleNamespace(document_type=doc_type, extraction_schema=schema)


def _scalars_first(value):
    result = MagicMock()
    result.scalars.return_value.first.return_value = value
    return result


def _scalars_all(values):
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(values)
    return result


@pytest.mark.asyncio
async def test_privacy_info_returns_empty_when_no_active_year() -> None:
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalars_first(None))

    response = await get_privacy_info(db)

    assert response.activeSchoolYear is None
    assert response.requiredDocuments == []


@pytest.mark.asyncio
async def test_privacy_info_returns_sanitized_projection() -> None:
    school_year = _school_year()
    doc_type = _doc_type("Birth Certificate", "birth_cert", "PSA-issued birth certificate")
    schema = _schema(
        [
            {"key": "full_name", "description": "Complete name", "type": "string"},
            {
                "key": "gender",
                "description": "Gender",
                "type": "select",
                "options": [
                    {"value": "male", "label": "Male"},
                    {"value": "female", "label": "Female"},
                ],
                "is_analytics": True,
                "canonical_key": "gender",
            },
            {"key": "is_internal", "description": "internal", "type": "boolean", "is_computed": True},
        ]
    )
    slot = SimpleNamespace(items=[_item(doc_type, schema)])

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_first(school_year),
            _scalars_all([slot]),
        ]
    )

    response = await get_privacy_info(db)

    assert response.activeSchoolYear is not None
    assert response.activeSchoolYear.name == "2025-2026"
    assert response.activeSchoolYear.status == "active"

    assert len(response.requiredDocuments) == 1
    doc = response.requiredDocuments[0]
    assert doc.name == "Birth Certificate"
    assert doc.code == "birth_cert"

    keys = {field.key for field in doc.extractedFields}
    assert keys == {"full_name", "gender", "is_internal"}

    gender = next(f for f in doc.extractedFields if f.key == "gender")
    assert gender.options == ["Male", "Female"]


@pytest.mark.asyncio
async def test_privacy_info_excludes_private_field_keys() -> None:
    """Internal field keys (canonical_key, buckets, readOnly, ...) must never
    leak into the public projection."""
    school_year = _school_year()
    doc_type = _doc_type("Admission Form", "admission_form", "Official admission form")
    schema = _schema(
        [
            {"key": "full_name", "description": "Complete name", "type": "string"},
            {"key": "canonical_key", "description": "Internal analytics key", "type": "string"},
            {"key": "buckets", "description": "Internal bucket config", "type": "string"},
            {"key": "readOnly", "description": "Internal UI flag", "type": "boolean"},
        ]
    )
    slot = SimpleNamespace(items=[_item(doc_type, schema)])

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[_scalars_first(school_year), _scalars_all([slot])])

    response = await get_privacy_info(db)

    keys = {field.key for field in response.requiredDocuments[0].extractedFields}
    assert keys == {"full_name"}


@pytest.mark.asyncio
async def test_privacy_info_dedupes_shared_document_types() -> None:
    school_year = _school_year()
    shared_type = _doc_type("Birth Certificate", "birth_cert", "PSA-issued birth certificate")
    schema = _schema([{"key": "full_name", "description": "Complete name", "type": "string"}])
    slot_a = SimpleNamespace(items=[_item(shared_type, schema)])
    slot_b = SimpleNamespace(items=[_item(shared_type, schema)])

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_first(school_year),
            _scalars_all([slot_a, slot_b]),
        ]
    )

    response = await get_privacy_info(db)

    assert len(response.requiredDocuments) == 1


@pytest.mark.asyncio
async def test_privacy_info_falls_back_to_legacy_requirements() -> None:
    school_year = _school_year()
    doc_type = _doc_type("Report Card", "report_card", "Official academic record")
    schema = _schema([{"key": "gpa", "description": "Grade point average", "type": "number"}])
    legacy_row = SimpleNamespace(document_type=doc_type, extraction_schema=schema)

    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[
            _scalars_first(school_year),
            _scalars_all([]),
            _scalars_all([legacy_row]),
        ]
    )

    response = await get_privacy_info(db)

    assert len(response.requiredDocuments) == 1
    assert response.requiredDocuments[0].name == "Report Card"
    assert response.requiredDocuments[0].extractedFields[0].key == "gpa"
