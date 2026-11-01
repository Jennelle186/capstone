"""Coverage for every audited action in phase 5: branding and logo, analytics
dimension registry, and storage cleanup. The database and external services are
mocked; each test checks the AdminAuditLog row that would be stored."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import AdminAuditLog, AnalyticsDimension
from app.routers.admin import analytics_dimensions as dim_router
from app.routers.admin import branding as branding_router
from app.routers.admin import gcs_cleanup as gcs_router
from app.routers.admin.analytics_dimensions import AnalyticsDimensionCreateRequest, AnalyticsDimensionUpdateRequest
from app.schemas.branding import BrandingSettingsUpdate

ADMIN = {"sub": "clerk_admin"}


def _result(value=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    return result


def _db(*execute_results):
    """Scripted lookups in order; any later lookup (the audit actor) returns no row."""
    queue = list(execute_results)

    async def _execute(*_args, **_kwargs):
        return queue.pop(0) if queue else _result(None)

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=_execute)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    return db


def _audit_rows(db) -> list[AdminAuditLog]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog)]


def _single_row(db) -> AdminAuditLog:
    rows = _audit_rows(db)
    assert len(rows) == 1, f"expected one audit row, got {len(rows)}"
    return rows[0]


def _settings(**overrides):
    base = dict(
        id=1,
        institution_name="College of Computing Studies",
        address_lines=["Campus Address"],
        contact_line="registrar@example.edu",
        logo_file_key=None,
        logo_content_type=None,
        updated_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ---------- branding ---------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,expected_previous,expected_new",
    [
        (
            {"institution_name": "Western Mindanao State University"},
            {"institution_name": "College of Computing Studies"},
            {"institution_name": "Western Mindanao State University"},
        ),
        (
            {"address_lines": ["Normal Road", "Zamboanga City"]},
            {"address_lines": ["Campus Address"]},
            {"address_lines": ["Normal Road", "Zamboanga City"]},
        ),
        (
            {"contact_line": "office@example.edu"},
            {"contact_line": "registrar@example.edu"},
            {"contact_line": "office@example.edu"},
        ),
    ],
)
async def test_branding_update_is_logged_for_each_field(update_kwargs, expected_previous, expected_new):
    settings = _settings()
    db = _db(_result(settings))

    with patch.object(branding_router, "_serialize", return_value={}):
        await branding_router.update_branding_settings(BrandingSettingsUpdate(**update_kwargs), ADMIN, db)

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "branding"
    assert row.previous_values == expected_previous
    assert row.new_values == expected_new
    assert row.audit_metadata["entity_label"] == settings.institution_name


@pytest.mark.asyncio
async def test_branding_save_with_no_change_is_not_logged():
    db = _db(_result(_settings()))

    with patch.object(branding_router, "_serialize", return_value={}):
        await branding_router.update_branding_settings(
            BrandingSettingsUpdate(institution_name="College of Computing Studies"),
            ADMIN,
            db,
        )

    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_branding_logo_change_is_logged_with_previous_and_new_key():
    settings = _settings(logo_file_key="branding/old.png")
    db = _db(_result(settings))
    new_key = "branding/new-logo.png"

    with (
        patch.object(branding_router, "head_object", MagicMock(return_value={"size": 1024, "content_type": "image/png"})),
        patch.object(branding_router, "gcs_delete_file", MagicMock()),
        patch.object(branding_router, "_serialize", return_value={}),
    ):
        await branding_router.confirm_logo_upload(new_key, ADMIN, db)

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "branding"
    assert row.previous_values == {"logo_file_key": "branding/old.png"}
    assert row.new_values == {"logo_file_key": new_key, "logo_content_type": "image/png"}


# ---------- analytics dimension registry -------------------------------------

def _dimension(**overrides):
    base = dict(
        id=uuid4(),
        canonical_key="strand",
        label="Strand",
        field_type="select",
        analytics_group="Academic",
        is_active=True,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_analytics_dimension_create_is_logged():
    dim_id = uuid4()
    db = _db(_result(None))  # no existing key

    async def flush():
        db.add.call_args_list[0].args[0].id = dim_id

    db.flush = AsyncMock(side_effect=flush)

    with patch.object(dim_router, "_serialize_dimension", return_value={}):
        await dim_router.create_analytics_dimension(
            AnalyticsDimensionCreateRequest(canonical_key="Strand", label="Strand", field_type="select"),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "analytics_dimension"
    assert row.entity_id == dim_id
    assert row.audit_metadata == {"entity_label": "strand"}
    assert row.new_values["canonical_key"] == "strand"
    assert row.new_values["is_active"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,expected_previous,expected_new",
    [
        ({"label": "Track"}, {"label": "Strand"}, {"label": "Track"}),
        ({"field_type": "string"}, {"field_type": "select"}, {"field_type": "string"}),
        ({"analytics_group": "Enrolment"}, {"analytics_group": "Academic"}, {"analytics_group": "Enrolment"}),
        ({"is_active": False}, {"is_active": True}, {"is_active": False}),
    ],
)
async def test_analytics_dimension_update_is_logged_for_each_field(update_kwargs, expected_previous, expected_new):
    dimension = _dimension()
    db = _db()
    db.get = AsyncMock(return_value=dimension)

    with patch.object(dim_router, "_serialize_dimension", return_value={}):
        await dim_router.update_analytics_dimension(
            dimension.id,
            AnalyticsDimensionUpdateRequest(**update_kwargs),
            ADMIN,
            db,
        )

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "analytics_dimension"
    assert row.entity_id == dimension.id
    assert row.previous_values == expected_previous
    assert row.new_values == expected_new


@pytest.mark.asyncio
async def test_analytics_dimension_deactivate_is_logged_when_it_was_active():
    dimension = _dimension(is_active=True)
    db = _db()
    db.get = AsyncMock(return_value=dimension)

    with patch.object(dim_router, "_serialize_dimension", return_value={}):
        await dim_router.deactivate_analytics_dimension(dimension.id, ADMIN, db)

    row = _single_row(db)
    assert row.action == "deactivate"
    assert row.entity_type == "analytics_dimension"
    assert row.previous_values == {"is_active": True}
    assert row.new_values == {"is_active": False}
    assert dimension.is_active is False


@pytest.mark.asyncio
async def test_analytics_dimension_deactivate_is_not_logged_when_already_inactive():
    dimension = _dimension(is_active=False)
    db = _db()
    db.get = AsyncMock(return_value=dimension)

    with patch.object(dim_router, "_serialize_dimension", return_value={}):
        await dim_router.deactivate_analytics_dimension(dimension.id, ADMIN, db)

    assert _audit_rows(db) == []


# ---------- storage cleanup --------------------------------------------------

def _cleanup_result(**overrides):
    base = dict(
        dry_run=False,
        scanned=10,
        orphaned_count=3,
        deleted_count=3,
        failed_keys=[],
        orphaned_keys=["a", "b", "c"],
    )
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_storage_cleanup_real_run_is_logged():
    db = _db()

    with patch.object(gcs_router, "run_cleanup", AsyncMock(return_value=_cleanup_result())):
        await gcs_router.cleanup_orphaned_files(gcs_router.GcsCleanupRequest(dry_run=False), ADMIN, db)

    row = _single_row(db)
    assert row.action == "delete"
    assert row.entity_type == "gcs_cleanup"
    assert row.new_values == {"scanned": 10, "orphaned_count": 3, "deleted_count": 3, "failed_count": 0}
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_storage_cleanup_dry_run_is_not_logged():
    db = _db()

    with patch.object(gcs_router, "run_cleanup", AsyncMock(return_value=_cleanup_result(dry_run=True, deleted_count=0))):
        await gcs_router.cleanup_orphaned_files(gcs_router.GcsCleanupRequest(dry_run=True), ADMIN, db)

    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_storage_cleanup_that_deleted_nothing_is_not_logged():
    db = _db()

    with patch.object(gcs_router, "run_cleanup", AsyncMock(return_value=_cleanup_result(deleted_count=0, orphaned_count=0))):
        await gcs_router.cleanup_orphaned_files(gcs_router.GcsCleanupRequest(dry_run=False), ADMIN, db)

    assert _audit_rows(db) == []
