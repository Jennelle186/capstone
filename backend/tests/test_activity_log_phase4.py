"""Coverage for every audited action in phase 4: document types, requirements and
slots, extraction schemas, and forms. Each test runs the real code path with the
database and external calls mocked, then checks the AdminAuditLog row that would
be stored."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import (
    AdminAuditLog,
    DocumentType,
    DocumentTypeStatus,
    ExtractionSchema,
    ExtractionSchemaStatus,
    Form,
    SchoolYearStatus,
)
from app.routers.admin import document_management as dm_router
from app.routers.admin import extraction_schemas as es_router
from app.routers.admin import forms as forms_router
from app.routers.admin import requirements as req_router
from app.schemas.document_management import DocumentTypeCreateRequest, DocumentTypeUpdateRequest
from app.schemas.extraction_schemas import ExtractionSchemaCreateRequest, ExtractionSchemaUpdateRequest
from app.schemas.forms import FormCreate, FormUpdate
from app.services import document_requirements as dr_svc
from app.services import requirements as slot_svc


# ---------- helpers ---------------------------------------------------------

def _result(value=None, *, rows=None, scalars=None, rowcount=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.first.return_value = value
    result.all.return_value = rows if rows is not None else []
    result.scalars.return_value = MagicMock(all=MagicMock(return_value=scalars or []))
    result.rowcount = rowcount
    return result


def _db(*execute_results):
    """Scripted lookups in order; any later lookup (e.g. the audit actor) returns no row."""
    queue = list(execute_results)

    async def _execute(*_args, **_kwargs):
        return queue.pop(0) if queue else _result(None)

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=_execute)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    db.delete = AsyncMock()
    return db


def _audit_rows(db) -> list[AdminAuditLog]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog)]


def _single_row(db) -> AdminAuditLog:
    rows = _audit_rows(db)
    assert len(rows) == 1, f"expected one audit row, got {len(rows)}"
    return rows[0]


ADMIN = {"sub": "clerk_admin"}


# ---------- document types ---------------------------------------------------

@pytest.mark.asyncio
async def test_document_type_create_is_logged():
    doc_id = uuid4()
    db = _db(_result(None))  # no existing code

    async def flush():
        db.add.call_args.args[0].id = doc_id

    db.flush = AsyncMock(side_effect=flush)

    with patch.object(dm_router, "serialize_document_type", return_value={}):
        await dm_router.create_document_type(
            DocumentTypeCreateRequest(name="Birth Certificate", code="BIRTH", description="PSA copy"),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "document_type"
    assert row.entity_id == doc_id
    assert row.audit_metadata == {"entity_label": "Birth Certificate"}
    assert row.new_values["code"] == "BIRTH"
    assert row.new_values["status"] == "active"


def _document_type(**overrides):
    base = dict(
        id=uuid4(),
        name="Birth Certificate",
        code="BIRTH",
        description="PSA copy",
        classifier_description=None,
        keywords=[],
        applicable_classifications=[],
        status=DocumentTypeStatus.ACTIVE,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,expected_previous,expected_new",
    [
        ({"name": "PSA Birth Certificate"}, {"name": "Birth Certificate"}, {"name": "PSA Birth Certificate"}),
        ({"description": "Certified copy"}, {"description": "PSA copy"}, {"description": "Certified copy"}),
        ({"keywords": ["psa", "birth"]}, {"keywords": []}, {"keywords": ["psa", "birth"]}),
        ({"status": DocumentTypeStatus.ARCHIVED}, {"status": "active"}, {"status": "archived"}),
    ],
)
async def test_document_type_update_is_logged_for_each_field(update_kwargs, expected_previous, expected_new):
    document_type = _document_type()
    db = _db(_result(None))
    db.get = AsyncMock(return_value=document_type)

    with patch.object(dm_router, "serialize_document_type", return_value={}):
        await dm_router.update_document_type(
            document_type.id,
            DocumentTypeUpdateRequest(**update_kwargs),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "document_type"
    assert row.entity_id == document_type.id
    assert row.previous_values == expected_previous
    assert row.new_values == expected_new


@pytest.mark.asyncio
async def test_document_type_update_with_same_values_is_not_logged():
    document_type = _document_type()
    db = _db(_result(None))
    db.get = AsyncMock(return_value=document_type)

    with patch.object(dm_router, "serialize_document_type", return_value={}):
        await dm_router.update_document_type(
            document_type.id,
            DocumentTypeUpdateRequest(name="Birth Certificate"),
            ADMIN,
            db,
        )

    assert _audit_rows(db) == []


# ---------- school-year requirements ----------------------------------------

@pytest.mark.asyncio
async def test_school_year_requirement_change_is_logged_with_added_and_removed_types():
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    kept_type, dropped_type, added_type = uuid4(), uuid4(), uuid4()
    previous_rows = [
        SimpleNamespace(document_type_id=kept_type, extraction_schema_id=None),
        SimpleNamespace(document_type_id=dropped_type, extraction_schema_id=None),
    ]
    db = _db(_result(rows=previous_rows))  # existing requirements snapshot
    db.get = AsyncMock(return_value=school_year)  # school year lookup (mutable check) uses get()

    with patch.object(dr_svc, "validate_requirement_assignments", AsyncMock()):
        await dr_svc.replace_school_year_requirements(
            db,
            school_year.id,
            [(kept_type, None), (added_type, None)],
            current_user=ADMIN,
        )

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "requirement"
    assert row.school_year_id == school_year.id
    assert row.audit_metadata == {"entity_label": "2026-2027"}
    assert str(dropped_type) + ":-" in row.previous_values["requirements"][0] or any(
        str(dropped_type) in entry for entry in row.previous_values["requirements"]
    )
    assert any(str(added_type) in entry for entry in row.new_values["requirements"])
    assert not any(str(dropped_type) in entry for entry in row.new_values["requirements"])


@pytest.mark.asyncio
async def test_school_year_requirement_save_without_change_is_not_logged():
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    doc_type = uuid4()
    db = _db(_result(rows=[SimpleNamespace(document_type_id=doc_type, extraction_schema_id=None)]))
    db.get = AsyncMock(return_value=school_year)

    with patch.object(dr_svc, "validate_requirement_assignments", AsyncMock()):
        await dr_svc.replace_school_year_requirements(
            db,
            school_year.id,
            [(doc_type, None)],
            current_user=ADMIN,
        )

    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_requirements_without_a_user_are_not_logged():
    """The rollover path calls the service without a user; it must not add a row."""
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    db = _db(_result(school_year))

    with patch.object(dr_svc, "validate_requirement_assignments", AsyncMock()):
        await dr_svc.replace_school_year_requirements(db, school_year.id, [(uuid4(), None)])

    assert _audit_rows(db) == []


# ---------- requirement slots ------------------------------------------------

@pytest.mark.asyncio
async def test_requirement_slot_save_is_logged():
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    doc_type = uuid4()
    previous_slot_id = uuid4()
    # Rows are (slot id, slot type, group name, document type id), as the query selects them.
    previous_rows = [(previous_slot_id, "solo", None, doc_type)]
    new_doc_type = uuid4()
    db = _db(
        _result(scalars=[new_doc_type]),  # document type validation for the new slot
        _result(rows=previous_rows),      # existing slot snapshot (previously doc_type)
    )
    # The slot moves from doc_type to new_doc_type, so the saved requirement really changes.
    slots_data = [
        {
            "slot_type": "solo",
            "group_name": None,
            "items": [{"document_type_id": new_doc_type}],
        },
    ]

    with patch.object(slot_svc, "ensure_slots_mutable", AsyncMock(return_value=school_year)):
        await slot_svc.replace_requirement_slots(db, school_year.id, slots_data, current_user=ADMIN)

    rows = [r for r in _audit_rows(db) if r.entity_type == "requirement_slot"]
    assert len(rows) == 1
    assert rows[0].action == "update"
    assert rows[0].school_year_id == school_year.id
    assert rows[0].audit_metadata == {"entity_label": "2026-2027"}
    assert any(str(doc_type) in entry for entry in rows[0].previous_values["slots"])
    assert any(str(new_doc_type) in entry for entry in rows[0].new_values["slots"])


@pytest.mark.asyncio
async def test_requirement_slot_save_without_change_is_not_logged():
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    doc_type = uuid4()
    previous_rows = [(uuid4(), "solo", None, doc_type)]
    db = _db(
        _result(scalars=[doc_type]),
        _result(rows=previous_rows),
    )
    slots_data = [{"slot_type": "solo", "group_name": None, "items": [{"document_type_id": doc_type}]}]

    with patch.object(slot_svc, "ensure_slots_mutable", AsyncMock(return_value=school_year)):
        await slot_svc.replace_requirement_slots(db, school_year.id, slots_data, current_user=ADMIN)

    assert [r for r in _audit_rows(db) if r.entity_type == "requirement_slot"] == []


@pytest.mark.asyncio
async def test_requirement_slots_route_passes_the_acting_user_through():
    payload = SimpleNamespace(school_year_id=uuid4(), slots=[])
    with (
        patch.object(req_router, "replace_requirement_slots", AsyncMock(return_value=[])) as replace,
        patch.object(req_router, "list_requirement_slots", AsyncMock(return_value=[])),
    ):
        await req_router.save_requirement_slots(payload, ADMIN, _db())

    assert replace.await_args.kwargs["current_user"] == ADMIN


# ---------- extraction schemas -----------------------------------------------

def _schema_payload(**overrides):
    base = dict(
        name="Enrolment Form",
        status=ExtractionSchemaStatus.DRAFT,
        fields_json=[{"id": "f1", "key": "student_name", "type": "string"}],
    )
    base.update(overrides)
    return ExtractionSchemaCreateRequest(**base)


@pytest.mark.asyncio
async def test_extraction_schema_create_is_logged():
    schema_id = uuid4()
    db = _db()

    async def flush():
        db.add.call_args.args[0].id = schema_id

    db.flush = AsyncMock(side_effect=flush)

    with patch.object(es_router, "serialize_extraction_schema", return_value={}):
        await es_router.create_extraction_schema(_schema_payload(), ADMIN, db)

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "extraction_schema"
    assert row.entity_id == schema_id
    assert row.audit_metadata == {"entity_label": "Enrolment Form"}
    # JSON bodies are stored as digests, not copied into the audit row.
    assert "fields_json" not in row.new_values
    assert row.new_values["fields_json_bytes"] > 0
    assert len(row.new_values["fields_json_sha256"]) == 64


def _schema(**overrides):
    base = dict(
        id=uuid4(),
        name="Enrolment Form",
        version_label="v1",
        effective_date=None,
        description=None,
        document_type_id=None,
        status=ExtractionSchemaStatus.DRAFT,
        source_file_name=None,
        generation_prompt=None,
        fields_json=[{"id": "f1", "key": "student_name", "type": "string"}],
        schema_json={},
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,field,expected_previous,expected_new",
    [
        ({"name": "Admission Form"}, "name", "Enrolment Form", "Admission Form"),
        ({"version_label": "v2"}, "version_label", "v1", "v2"),
        ({"description": "Updated"}, "description", None, "Updated"),
        ({"source_file_name": "form.pdf"}, "source_file_name", None, "form.pdf"),
    ],
)
async def test_extraction_schema_update_is_logged_for_each_field(update_kwargs, field, expected_previous, expected_new):
    schema = _schema()
    db = _db()
    db.get = AsyncMock(return_value=schema)

    with patch.object(es_router, "serialize_extraction_schema", return_value={}):
        await es_router.update_extraction_schema(
            schema.id,
            ExtractionSchemaUpdateRequest(**update_kwargs),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "extraction_schema"
    assert row.previous_values == {field: expected_previous}
    assert row.new_values == {field: expected_new}


@pytest.mark.asyncio
async def test_extraction_schema_field_change_logs_a_digest_of_the_definitions():
    schema = _schema()
    db = _db()
    db.get = AsyncMock(return_value=schema)
    payload = ExtractionSchemaUpdateRequest(
        fields_json=[
            {"id": "f1", "key": "student_name", "type": "string"},
            {"id": "f2", "key": "amount_paid", "type": "number"},
        ],
    )

    with patch.object(es_router, "serialize_extraction_schema", return_value={}):
        await es_router.update_extraction_schema(schema.id, payload, ADMIN, db)

    row = _single_row(db)
    assert set(row.previous_values) == {"fields_json_sha256", "fields_json_bytes"}
    assert row.previous_values["fields_json_sha256"] != row.new_values["fields_json_sha256"]
    assert row.new_values["fields_json_bytes"] > row.previous_values["fields_json_bytes"]


@pytest.mark.asyncio
async def test_extraction_schema_field_type_change_with_same_key_is_logged():
    # Regression: changing only a field's type (same key) used to produce no audit row.
    schema = _schema()
    db = _db()
    db.get = AsyncMock(return_value=schema)
    payload = ExtractionSchemaUpdateRequest(
        fields_json=[{"id": "f1", "key": "student_name", "type": "number"}],
    )

    with patch.object(es_router, "serialize_extraction_schema", return_value={}):
        await es_router.update_extraction_schema(schema.id, payload, ADMIN, db)

    row = _single_row(db)
    assert row.previous_values["fields_json_sha256"] != row.new_values["fields_json_sha256"]
    assert set(row.new_values) == {"fields_json_sha256", "fields_json_bytes"}


@pytest.mark.asyncio
async def test_extraction_schema_schema_json_only_change_is_logged():
    # Regression: a change that touches only schema_json used to produce no audit row.
    schema = _schema()
    db = _db()
    db.get = AsyncMock(return_value=schema)

    with patch.object(es_router, "serialize_extraction_schema", return_value={}):
        await es_router.update_extraction_schema(
            schema.id,
            ExtractionSchemaUpdateRequest(extraction_schema={"type": "object"}),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert set(row.previous_values) == {"schema_json_sha256", "schema_json_bytes"}
    assert row.previous_values["schema_json_sha256"] != row.new_values["schema_json_sha256"]


@pytest.mark.asyncio
async def test_extraction_schema_activate_logs_each_demoted_schema_and_the_activation():
    schema = _schema(status=ExtractionSchemaStatus.DRAFT, document_type_id=uuid4())
    demoted_a, demoted_b = uuid4(), uuid4()
    db = _db(
        _result(rows=[(demoted_a, "Old A"), (demoted_b, "Old B")]),  # schemas to demote
        _result(rowcount=2),  # the bulk update
    )
    db.get = AsyncMock(return_value=schema)

    with (
        patch.object(es_router, "validate_analytics_fields", return_value=[]),
        patch.object(es_router, "serialize_extraction_schema", return_value={}),
    ):
        await es_router.activate_extraction_schema(schema.id, ADMIN, db)

    rows = _audit_rows(db)
    demotions = [r for r in rows if r.action == "deactivate"]
    assert {r.entity_id for r in demotions} == {demoted_a, demoted_b}
    for row in demotions:
        assert row.previous_values == {"status": "active"}
        assert row.new_values == {"status": "draft"}
        assert row.audit_metadata["replaced_by_schema_id"] == str(schema.id)

    activation = _single_row_by_action(rows, "activate")
    assert activation.entity_type == "extraction_schema"
    assert activation.previous_values == {"status": "draft"}
    assert activation.new_values == {"status": "active"}
    assert activation.audit_metadata == {"entity_label": "Enrolment Form", "previous_active_demoted": 2}


def _single_row_by_action(rows, action):
    matches = [r for r in rows if r.action == action]
    assert len(matches) == 1, f"expected one {action} row, got {len(matches)}"
    return matches[0]


@pytest.mark.asyncio
async def test_create_form_from_schema_is_logged():
    schema = _schema(document_type_id=uuid4())
    form_id = uuid4()
    db = _db()
    db.get = AsyncMock(return_value=schema)

    async def flush():
        db.add.call_args.args[0].id = form_id

    db.flush = AsyncMock(side_effect=flush)

    with (
        patch.object(es_router, "schema_to_document", return_value={}),
        patch.object(es_router, "resolve_creator_id", AsyncMock(return_value=None)),
        patch.object(es_router, "serialize_form", return_value={}),
    ):
        await es_router.create_form_from_schema(schema.id, ADMIN, db)

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "form"
    assert row.entity_id == form_id
    assert row.new_values["extraction_schema_id"] == str(schema.id)


# ---------- forms ------------------------------------------------------------

@pytest.mark.asyncio
async def test_form_create_is_logged():
    form_id = uuid4()
    db = _db(_result(None), _result(None))  # actor lookup, then the reload after commit
    db.get = AsyncMock(return_value=None)

    async def flush():
        db.add.call_args.args[0].id = form_id

    db.flush = AsyncMock(side_effect=flush)

    with (
        patch.object(forms_router, "resolve_creator_id", AsyncMock(return_value=None)),
        patch.object(forms_router, "_validate_document", return_value={"version": 1}),
        patch.object(forms_router, "serialize_form", return_value={}),
    ):
        await forms_router.create_form(FormCreate(name="Enrolment Form"), ADMIN, db)

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "form"
    assert row.entity_id == form_id
    assert row.new_values["creation_mode"] == "structured"


def _form(**overrides):
    base = dict(
        id=uuid4(),
        name="Enrolment Form",
        description=None,
        creation_mode="structured",
        document_type_id=None,
        extraction_schema_id=None,
        document_json={"version": 1, "fields": []},
        extraction_schema=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,field,expected_previous,expected_new",
    [
        ({"name": "Admission Form"}, "name", "Enrolment Form", "Admission Form"),
        ({"description": "For freshmen"}, "description", None, "For freshmen"),
        (
            {"document_json": {"version": 2, "fields": []}},
            "document_sha256",
            forms_router._document_digest({"version": 1, "fields": []})["document_sha256"],
            forms_router._document_digest({"version": 2, "fields": []})["document_sha256"],
        ),
    ],
)
async def test_form_update_is_logged_for_each_field(update_kwargs, field, expected_previous, expected_new):
    form = _form()
    # Scripted order: the form load, the audit actor lookup (no row), then the reload after commit.
    db = _db(_result(form), _result(None), _result(form))
    with (
        patch.object(forms_router, "_validate_document", side_effect=lambda doc: doc),
        patch.object(forms_router, "_resolve_schema_for_form", AsyncMock()),
        patch.object(forms_router, "serialize_form", return_value={}),
    ):
        await forms_router.update_form(form.id, FormUpdate(**update_kwargs), ADMIN, db)

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "form"
    assert row.previous_values == {field: expected_previous}
    assert row.new_values == {field: expected_new}


@pytest.mark.asyncio
async def test_form_sync_to_schema_is_logged_with_field_changes():
    schema = _schema()
    form = _form(extraction_schema=schema)
    db = _db(_result(form))
    diff = {
        "fields": [{"id": "f2", "key": "date_of_birth", "type": "date"}],
        "added": ["date_of_birth"],
        "updated": [],
        "removed": ["student_name"],
        "blocked_removals": [],
    }

    with (
        patch.object(forms_router, "document_to_fields", return_value=[]),
        patch.object(forms_router, "diff_and_merge_schema_fields", return_value=diff),
    ):
        await forms_router.sync_form_schema(form.id, ADMIN, db)

    row = _single_row(db)
    assert row.action == "sync"
    assert row.entity_type == "extraction_schema"
    assert row.entity_id == schema.id
    assert row.new_values["added"] == ["date_of_birth"]
    assert row.new_values["removed"] == ["student_name"]


@pytest.mark.asyncio
async def test_form_sync_with_no_field_changes_is_not_logged():
    schema = _schema()
    form = _form(extraction_schema=schema)
    db = _db(_result(form))
    diff = {"fields": [], "added": [], "updated": [], "removed": [], "blocked_removals": []}

    with (
        patch.object(forms_router, "document_to_fields", return_value=[]),
        patch.object(forms_router, "diff_and_merge_schema_fields", return_value=diff),
    ):
        await forms_router.sync_form_schema(form.id, ADMIN, db)

    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_form_delete_is_logged_with_the_removed_form_snapshot():
    form = _form()
    db = _db()
    db.get = AsyncMock(return_value=form)

    await forms_router.delete_form(form.id, ADMIN, db)

    row = _single_row(db)
    assert row.action == "delete"
    assert row.entity_type == "form"
    assert row.entity_id == form.id
    assert row.audit_metadata == {"entity_label": "Enrolment Form"}
    assert row.previous_values["name"] == "Enrolment Form"
    db.delete.assert_awaited_once_with(form)
    db.commit.assert_awaited()
