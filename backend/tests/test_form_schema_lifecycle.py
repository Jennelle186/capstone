"""Tests for Phase 5 form ↔ schema lifecycle (provenance + draft + sync)."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.models import ExtractionSchema, ExtractionSchemaStatus, Form
from app.routers.admin.forms import (
    _resolve_schema_for_form,
    draft_schema_from_form,
    serialize_form,
    update_form,
)
from app.schemas.forms import FormCreate, FormUpdate
from app.services.form_schema_lifecycle import (
    create_draft_schema_from_form,
    diff_and_merge_schema_fields,
)

DOC = {
    "version": 1,
    "creation_mode": "structured",
    "title": "CET Form",
    "signatureLabel": "Signature",
    "sections": [
        {
            "id": "s1",
            "heading": "General",
            "fields": [],
            "blocks": [
                {"type": "field", "id": "b1", "field_key": "application_no", "label": "Application No.", "ui_component": "text_input", "required": True, "options": None},
                {"type": "field", "id": "b2", "field_key": "student_name", "label": "Name", "ui_component": "text_input", "required": True, "options": None},
            ],
        }
    ],
}


def _form_field(key: str, **overrides) -> dict:
    return {
        "id": f"gen_0_{key}",
        "key": key,
        "type": "string",
        "description": key.replace("_", " ").title(),
        "required": False,
        "ui_component": "text_input",
        "hierarchy_level": 1,
        "parent_field_id": None,
        "options": None,
        "section_id": "s1",
        "section_title": "Section",
        "is_analytics": False,
        **overrides,
    }


def _schema_field(key: str, field_id: str, **overrides) -> dict:
    return {
        "id": field_id,
        "key": key,
        "type": "string",
        "description": key.replace("_", " ").title(),
        "required": False,
        "ui_component": "text_input",
        "hierarchy_level": 1,
        "parent_field_id": None,
        "options": None,
        "section_id": "s1",
        "section_title": "Section",
        "is_analytics": False,
        **overrides,
    }


# ── diff_and_merge_schema_fields ─────────────────────────────────────────


def test_diff_adds_and_blocks_analytics_removal() -> None:
    form_fields = [_form_field("full_name"), _form_field("lrn")]
    schema_fields = [
        _schema_field("full_name", "f1"),
        _schema_field("old_analytics", "f2", is_analytics=True),
        _schema_field("old_plain", "f3"),
    ]

    result = diff_and_merge_schema_fields(form_fields, schema_fields)

    assert result["added"] == ["lrn"]
    assert result["removed"] == ["old_plain"]
    assert result["blocked_removals"] == ["old_analytics"]

    keys = [f["key"] for f in result["fields"]]
    assert "full_name" in keys
    assert "lrn" in keys
    assert "old_analytics" in keys  # kept (analytics-marked)
    assert "old_plain" not in keys  # dropped


def test_diff_updates_shape_and_preserves_analytics_metadata() -> None:
    form_fields = [_form_field("full_name", type="number", required=True, description="Full Name")]
    schema_fields = [
        _schema_field(
            "full_name",
            "f1",
            type="string",
            required=False,
            is_analytics=True,
            analytics_mode="distribution",
            canonical_key="name",
        )
    ]

    result = diff_and_merge_schema_fields(form_fields, schema_fields)

    assert result["updated"] == ["full_name"]
    merged = result["fields"][0]
    assert merged["id"] == "f1"  # stable id preserved
    assert merged["type"] == "number"  # shape from form
    assert merged["required"] is True
    assert merged["is_analytics"] is True  # analytics metadata preserved
    assert merged["analytics_mode"] == "distribution"
    assert merged["canonical_key"] == "name"


def test_diff_blocks_removal_referenced_by_computed_field() -> None:
    form_fields = [_form_field("a"), _form_field("total")]
    schema_fields = [
        _schema_field("a", "f1"),
        _schema_field("b", "f2"),
        _schema_field(
            "total",
            "f3",
            is_computed=True,
            computation={"operation": "sum", "dependencies": ["f2"]},
        ),
    ]

    result = diff_and_merge_schema_fields(form_fields, schema_fields)

    assert result["blocked_removals"] == ["b"]
    assert "b" in [f["key"] for f in result["fields"]]


# ── create_draft_schema_from_form ────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_draft_schema_from_form() -> None:
    form = SimpleNamespace(
        id=uuid4(),
        name="CET Form",
        description=None,
        document_type_id=uuid4(),
        document_json=DOC,
        extraction_schema_id=None,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    schema = await create_draft_schema_from_form(db, form)

    added = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], ExtractionSchema)]
    assert len(added) == 1
    assert added[0].status == ExtractionSchemaStatus.DRAFT
    assert added[0].document_type_id == form.document_type_id
    assert "Draft" in added[0].name
    assert [f["key"] for f in added[0].fields_json] == ["application_no", "student_name"]
    assert form.extraction_schema_id == schema.id
    assert schema is added[0]


# ── _resolve_schema_for_form ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_resolve_schema_for_form_accepts_matching_document_type() -> None:
    dt = uuid4()
    schema = SimpleNamespace(id=uuid4(), status=ExtractionSchemaStatus.ACTIVE, document_type_id=dt)
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)

    result = await _resolve_schema_for_form(db, schema.id, dt)

    assert result is schema


@pytest.mark.asyncio
async def test_resolve_schema_for_form_rejects_document_type_mismatch() -> None:
    dt = uuid4()
    schema = SimpleNamespace(id=uuid4(), status=ExtractionSchemaStatus.ACTIVE, document_type_id=uuid4())
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)

    with pytest.raises(HTTPException) as exc:
        await _resolve_schema_for_form(db, schema.id, dt)

    assert exc.value.status_code == 400
    assert "document type" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_resolve_schema_for_form_rejects_missing_or_archived() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await _resolve_schema_for_form(db, uuid4(), uuid4())
    assert exc.value.status_code == 400

    archived = SimpleNamespace(id=uuid4(), status=ExtractionSchemaStatus.ARCHIVED, document_type_id=None)
    db.get = AsyncMock(return_value=archived)
    with pytest.raises(HTTPException) as exc:
        await _resolve_schema_for_form(db, archived.id, uuid4())
    assert exc.value.status_code == 400


# ── serialize_form (provenance name) ─────────────────────────────────────


def _form_obj(*, extraction_schema):
    return SimpleNamespace(
        id=uuid4(),
        name="CET Form",
        description=None,
        creation_mode="structured",
        document_type_id=None,
        extraction_schema_id=extraction_schema.id if extraction_schema else None,
        extraction_schema=extraction_schema,
        document_json={},
        pdf_file_key=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_serialize_form_includes_schema_name() -> None:
    schema = SimpleNamespace(id=uuid4(), name="CET Schema")
    resp = serialize_form(_form_obj(extraction_schema=schema))

    assert resp.extraction_schema_id == schema.id
    assert resp.extraction_schema_name == "CET Schema"


def test_serialize_form_without_schema_returns_none() -> None:
    resp = serialize_form(_form_obj(extraction_schema=None))

    assert resp.extraction_schema_id is None
    assert resp.extraction_schema_name is None


# ── diff_and_merge_schema_fields: additional scenarios ───────────────────


def test_diff_empty_schema_adds_all_form_fields() -> None:
    form_fields = [_form_field("a"), _form_field("b")]

    result = diff_and_merge_schema_fields(form_fields, [])

    assert result["added"] == ["a", "b"]
    assert result["updated"] == []
    assert result["removed"] == []
    assert result["blocked_removals"] == []
    assert [f["key"] for f in result["fields"]] == ["a", "b"]


def test_diff_empty_form_removes_all_unblocked_fields() -> None:
    schema_fields = [_schema_field("a", "f1"), _schema_field("b", "f2")]

    result = diff_and_merge_schema_fields([], schema_fields)

    assert result["added"] == []
    assert result["removed"] == ["a", "b"]
    assert result["blocked_removals"] == []
    assert result["fields"] == []


def test_diff_no_changes_returns_empty_summary() -> None:
    form_fields = [_form_field("a")]
    schema_fields = [_schema_field("a", "f1")]  # identical shape

    result = diff_and_merge_schema_fields(form_fields, schema_fields)

    assert result["added"] == []
    assert result["updated"] == []
    assert result["removed"] == []
    assert [f["key"] for f in result["fields"]] == ["a"]


def test_diff_ignores_non_dict_schema_entries() -> None:
    form_fields = [_form_field("a")]
    schema_fields = ["garbage", _schema_field("a", "f1")]

    result = diff_and_merge_schema_fields(form_fields, schema_fields)

    assert result["added"] == []
    assert result["updated"] == []
    # non-dict entries are preserved verbatim rather than treated as fields
    assert result["fields"][0] == "garbage"
    assert result["fields"][1]["key"] == "a"


# ── create_draft_schema_from_form: additional scenarios ──────────────────


@pytest.mark.asyncio
async def test_create_draft_schema_from_empty_document() -> None:
    form = SimpleNamespace(
        id=uuid4(),
        name="Empty Form",
        description=None,
        document_type_id=None,
        document_json={"version": 1, "creation_mode": "structured", "title": "Empty", "sections": []},
        extraction_schema_id=None,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    schema = await create_draft_schema_from_form(db, form)

    assert schema.fields_json == []


@pytest.mark.asyncio
async def test_create_draft_schema_truncates_long_name() -> None:
    form = SimpleNamespace(
        id=uuid4(),
        name="X" * 120,
        description=None,
        document_type_id=None,
        document_json=DOC,
        extraction_schema_id=None,
    )
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    schema = await create_draft_schema_from_form(db, form)

    assert len(schema.name) <= 120


# ── _resolve_schema_for_form: additional scenarios ───────────────────────


@pytest.mark.asyncio
async def test_resolve_schema_for_form_accepts_null_schema_document_type() -> None:
    schema = SimpleNamespace(id=uuid4(), status=ExtractionSchemaStatus.ACTIVE, document_type_id=None)
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)

    result = await _resolve_schema_for_form(db, schema.id, uuid4())

    assert result is schema


@pytest.mark.asyncio
async def test_resolve_schema_for_form_accepts_null_form_document_type() -> None:
    schema = SimpleNamespace(id=uuid4(), status=ExtractionSchemaStatus.ACTIVE, document_type_id=uuid4())
    db = AsyncMock()
    db.get = AsyncMock(return_value=schema)

    result = await _resolve_schema_for_form(db, schema.id, None)

    assert result is schema


# ── update_form provenance re-validation ──────────────────────────────────


def _update_form_schema(schema_id: UUID, doc_type_id: UUID | None) -> SimpleNamespace:
    return SimpleNamespace(
        id=schema_id,
        name="CET Schema",
        status=ExtractionSchemaStatus.ACTIVE,
        document_type_id=doc_type_id,
    )


@pytest.mark.asyncio
async def test_update_form_rejects_doc_type_change_mismatching_linked_schema() -> None:
    schema_id = uuid4()
    old_dt = uuid4()
    new_dt = uuid4()
    form = SimpleNamespace(
        id=uuid4(),
        name="CET Form",
        description=None,
        creation_mode="structured",
        document_type_id=old_dt,
        extraction_schema_id=schema_id,
        extraction_schema=SimpleNamespace(id=schema_id, name="CET Schema"),
        document_json={},
        pdf_file_key=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    fetch = MagicMock()
    fetch.scalar_one_or_none.return_value = form
    db = AsyncMock()
    db.execute = AsyncMock(return_value=fetch)
    db.get = AsyncMock(return_value=_update_form_schema(schema_id, old_dt))

    payload = FormUpdate(document_type_id=new_dt)

    with pytest.raises(HTTPException) as exc:
        await update_form(form.id, payload, {}, db)

    assert exc.value.status_code == 400
    assert "document type" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_update_form_accepts_matching_doc_type_and_schema() -> None:
    schema_id = uuid4()
    dt = uuid4()
    form = SimpleNamespace(
        id=uuid4(),
        name="CET Form",
        description=None,
        creation_mode="structured",
        document_type_id=dt,
        extraction_schema_id=schema_id,
        extraction_schema=SimpleNamespace(id=schema_id, name="CET Schema"),
        document_json={},
        pdf_file_key=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    fetch = MagicMock()
    fetch.scalar_one_or_none.return_value = form
    refetch = MagicMock()
    refetch.scalar_one.return_value = form
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[fetch, refetch])
    db.get = AsyncMock(return_value=_update_form_schema(schema_id, dt))

    payload = FormUpdate(name="Renamed", document_type_id=dt)

    resp = await update_form(form.id, payload, {}, db)

    assert resp.name == "Renamed"
    assert resp.extraction_schema_name == "CET Schema"


# ── draft_schema_from_form double-link guard ──────────────────────────────


@pytest.mark.asyncio
async def test_draft_schema_from_form_rejects_already_linked() -> None:
    schema_id = uuid4()
    form = SimpleNamespace(id=uuid4(), extraction_schema_id=schema_id)
    db = AsyncMock()
    db.get = AsyncMock(return_value=form)

    with pytest.raises(HTTPException) as exc:
        await draft_schema_from_form(form.id, {}, db)

    assert exc.value.status_code == 400
    assert "already" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_draft_schema_from_form_succeeds_when_unlinked(monkeypatch) -> None:
    from app.routers.admin import forms as forms_router

    form = SimpleNamespace(id=uuid4(), extraction_schema_id=None)
    schema = SimpleNamespace(id=uuid4(), name="CET Form (Draft)")
    db = AsyncMock()
    db.get = AsyncMock(return_value=form)

    async def fake_create(db_, form_):
        return schema

    monkeypatch.setattr(forms_router, "create_draft_schema_from_form", fake_create)

    resp = await forms_router.draft_schema_from_form(form.id, {}, db)

    assert resp.schema_id == schema.id
    assert resp.form_id == form.id
    assert resp.schema_name == "CET Form (Draft)"


# ── create_form provenance persistence ────────────────────────────────────


@pytest.mark.asyncio
async def test_create_form_persists_schema_link(monkeypatch) -> None:
    from app.routers.admin import forms as forms_router

    schema_id = uuid4()
    dt = uuid4()
    refetched = SimpleNamespace(
        id=uuid4(),
        name="CET Form",
        description=None,
        creation_mode="structured",
        document_type_id=dt,
        extraction_schema_id=schema_id,
        extraction_schema=SimpleNamespace(id=schema_id, name="CET Schema"),
        document_json=DOC,
        pdf_file_key=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_resolve_creator(db_, current_user_):
        return None

    async def fake_resolve_schema(db_, schema_id_, doc_type_id_):
        return None

    def fake_validate(document_json):
        return DOC

    monkeypatch.setattr(forms_router, "resolve_creator_id", fake_resolve_creator)
    monkeypatch.setattr(forms_router, "_resolve_schema_for_form", fake_resolve_schema)
    monkeypatch.setattr(forms_router, "_validate_document", fake_validate)

    refetch = MagicMock()
    refetch.scalar_one.return_value = refetched
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock(return_value=refetch)

    payload = FormCreate(
        name="CET Form",
        document_type_id=dt,
        extraction_schema_id=schema_id,
        document_json=DOC,
    )

    resp = await forms_router.create_form(payload, {}, db)

    assert resp.extraction_schema_name == "CET Schema"
    added = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Form)]
    assert len(added) == 1
    assert added[0].extraction_schema_id == schema_id
    assert added[0].document_type_id == dt


# ── sync_form_schema router ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_form_schema_returns_diff_summary() -> None:
    from app.routers.admin import forms as forms_router

    schema = SimpleNamespace(id=uuid4(), fields_json=[_schema_field("a", "f1")])
    form = SimpleNamespace(id=uuid4(), document_json=DOC, extraction_schema=schema)

    fetch = MagicMock()
    fetch.scalar_one_or_none.return_value = form
    db = AsyncMock()
    db.execute = AsyncMock(return_value=fetch)
    db.commit = AsyncMock()

    resp = await forms_router.sync_form_schema(form.id, {}, db)

    assert resp.added == ["application_no", "student_name"]
    assert resp.removed == ["a"]
    assert resp.updated == []
    assert resp.blocked_removals == []
    assert [f["key"] for f in schema.fields_json] == ["application_no", "student_name"]


@pytest.mark.asyncio
async def test_sync_form_schema_requires_linked_schema() -> None:
    from app.routers.admin import forms as forms_router

    form = SimpleNamespace(id=uuid4(), extraction_schema=None)

    fetch = MagicMock()
    fetch.scalar_one_or_none.return_value = form
    db = AsyncMock()
    db.execute = AsyncMock(return_value=fetch)

    with pytest.raises(HTTPException) as exc:
        await forms_router.sync_form_schema(form.id, {}, db)

    assert exc.value.status_code == 400
    assert "linked" in exc.value.detail.lower()
