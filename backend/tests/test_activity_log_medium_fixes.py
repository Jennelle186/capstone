"""Regression tests for the Medium activity-log review findings (F1 school-year panel, F3 draft schema)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models import AdminAuditLog, ExtractionSchema
from app.routers.admin import forms as forms_router
from app.services import school_years as sy
from app.services.form_schema_lifecycle import create_draft_schema_from_form

ADMIN = {"sub": "clerk_admin"}


def _no_row_result():
    return MagicMock(scalar_one_or_none=MagicMock(return_value=None))


# ---- F1: school-year panel ------------------------------------------------

@pytest.mark.asyncio
async def test_school_year_panel_query_excludes_activity_only_entity_types():
    captured: dict = {}

    async def _execute(stmt, *_args, **_kwargs):
        captured["stmt"] = stmt
        return MagicMock(all=MagicMock(return_value=[]))

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=_execute)

    with patch.object(sy, "get_school_year_or_404", AsyncMock()):
        assert await sy.list_school_year_audit_logs(db, uuid4()) == []

    sql = str(captured["stmt"].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert "entity_type NOT IN" in sql
    for entity_type in sy.SCHOOL_YEAR_PANEL_EXCLUDED_ENTITY_TYPES:
        assert f"'{entity_type}'" in sql
    # School-year rows themselves are not excluded.
    assert "'school_year'" not in sql


# ---- F3: draft schema from form is audited --------------------------------

def _form():
    return SimpleNamespace(
        id=uuid4(),
        name="Enrolment Form",
        description=None,
        document_type_id=None,
        document_json={"version": 1, "fields": []},
        extraction_schema_id=None,
    )


@pytest.mark.asyncio
async def test_draft_schema_creation_is_logged_before_commit():
    form = _form()
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_no_row_result())

    audit_rows_at_commit: list[int] = []

    async def _commit():
        audit_rows_at_commit.append(
            sum(1 for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog))
        )

    db.commit = AsyncMock(side_effect=_commit)

    schema = await create_draft_schema_from_form(db, form, ADMIN)

    assert isinstance(schema, ExtractionSchema)
    assert audit_rows_at_commit == [1]  # the audit row was queued in the same transaction, before commit
    row = next(c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog))
    assert row.action == "create"
    assert row.entity_type == "extraction_schema"
    assert row.new_values["source_form_id"] == str(form.id)
    assert row.new_values["status"] == "draft"


@pytest.mark.asyncio
async def test_draft_schema_creation_without_user_writes_no_audit_row():
    form = _form()
    db = AsyncMock()
    db.add = MagicMock()

    await create_draft_schema_from_form(db, form)

    assert not any(isinstance(c.args[0], AdminAuditLog) for c in db.add.call_args_list)
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_draft_route_passes_the_acting_admin_to_the_service(monkeypatch):
    form = SimpleNamespace(id=uuid4(), extraction_schema_id=None)
    schema = SimpleNamespace(id=uuid4(), name="Enrolment Form (Draft)")
    db = AsyncMock()
    db.get = AsyncMock(return_value=form)
    seen: dict = {}

    async def fake_create(db_, form_, current_user=None):
        seen["current_user"] = current_user
        return schema

    monkeypatch.setattr(forms_router, "create_draft_schema_from_form", fake_create)

    await forms_router.draft_schema_from_form(form.id, ADMIN, db)

    assert seen["current_user"] == ADMIN
