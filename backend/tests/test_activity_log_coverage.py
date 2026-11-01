"""Coverage for every audited action in the modules instrumented so far.

Each test runs the real code path with the database and external services mocked,
then checks the AdminAuditLog row that would be stored (action, entity type, actor
snapshot, changed fields). Phase 1 covers the shared helper and retention, phase 2
the People modules, and phase 3 the academic-setup modules.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import (
    ActivityLogSettings,
    AdminAuditLog,
    AdviserInvitationStatus,
    SchoolYearStatus,
    UserRole,
)
from app.routers.admin import adviser_invitations as inv_router
from app.routers.admin import adviser_management as adv_router
from app.routers.admin import departments as dept_router
from app.routers.admin.adviser_invitations import CreateAdviserInvitationRequest, create_adviser_invitation
from app.routers.admin.adviser_management import AdviserUpdateRequest, update_adviser, update_adviser_status
from app.routers.admin.users import UpdateRoleRequest, update_user_role
from app.routers.admin.departments import AdviserDepartmentUpdateRequest, update_adviser_department
from app.services import activity_log as svc
from app.services import admin_management as admin_svc
from app.services import school_years as sy_svc
from app.services.helpers import program_uuid_for_department_code


# ---------- shared helpers -------------------------------------------------

def _result(value=None, *, rows=None, scalars=None, first=None):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.first.return_value = first
    result.all.return_value = rows if rows is not None else []
    result.scalars.return_value = MagicMock(all=MagicMock(return_value=scalars or []))
    return result


def _db(*execute_results):
    """Mock session. Scripted results are returned in order; any further lookup
    (for example the audit actor lookup) returns "no row" instead of failing."""
    queue = list(execute_results)

    async def _execute(*_args, **_kwargs):
        return queue.pop(0) if queue else _result(None)

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=_execute)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    return db


def _audit_rows(db) -> list[AdminAuditLog]:
    return [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AdminAuditLog)]


def _single_row(db) -> AdminAuditLog:
    rows = _audit_rows(db)
    assert len(rows) == 1, f"expected exactly one audit row, got {len(rows)}"
    return rows[0]


def _user(**overrides):
    base = dict(
        id=uuid4(),
        clerk_user_id="user_ada",
        first_name="Ada",
        middle_name=None,
        last_name="Lovelace",
        email="ada@example.com",
        role=UserRole.ADVISER,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ---------- phase 1: shared helper, school years, admin service -------------

@pytest.mark.parametrize(
    "action",
    ["create", "update", "activate", "deactivate", "close", "reopen", "rollover"],
)
@pytest.mark.asyncio
async def test_school_year_actions_are_logged(action):
    """Every school-year action writes a school_year row linked to that year."""
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027")
    db = _db(_result(None))  # actor lookup finds nothing

    await sy_svc.log_school_year_action(
        db,
        school_year,
        action,
        {"sub": "clerk_admin"},
        previous_values={"status": "upcoming"},
        new_values={"status": action},
    )

    row = _single_row(db)
    assert row.action == action
    assert row.entity_type == "school_year"
    assert row.school_year_id == school_year.id
    assert row.actor_clerk_user_id == "clerk_admin"
    assert row.audit_metadata == {"entity_label": "2026-2027"}


@pytest.mark.parametrize("action", ["admin_invite", "admin_promote", "admin_remove"])
@pytest.mark.asyncio
async def test_admin_management_actions_are_logged(action):
    db = _db(_result(None))
    entity_id = uuid4()

    await admin_svc._log_action(db, action, entity_id, {"sub": "clerk_admin"}, new_values={"email": "x@y.z"})

    row = _single_row(db)
    assert row.action == action
    assert row.entity_type == "admin"
    assert row.entity_id == entity_id


@pytest.mark.asyncio
async def test_admin_invitation_revoke_is_logged_with_status_change():
    invitation = SimpleNamespace(
        id=uuid4(),
        email="new.admin@example.edu",
        status=AdviserInvitationStatus.PENDING,
        clerk_invitation_id="inv_1",
    )
    db = _db(_result(None))
    db.get = AsyncMock(return_value=invitation)

    with (
        patch.object(admin_svc, "revoke_application_invitation", AsyncMock()),
        patch.object(admin_svc, "_to_invitation_response", return_value={}),
    ):
        await admin_svc.revoke_invitation(db, invitation.id, {"sub": "clerk_admin"})

    row = _single_row(db)
    assert row.action == "revoke"
    assert row.entity_type == "admin"
    assert row.entity_id == invitation.id
    assert row.audit_metadata == {"entity_label": "new.admin@example.edu"}
    assert row.previous_values == {"status": "pending"}
    assert row.new_values == {"status": "revoked"}


# ---------- phase 2: People modules ----------------------------------------

@pytest.mark.asyncio
async def test_adviser_profile_update_logs_only_changed_fields():
    user = _user()
    adviser = SimpleNamespace(id=uuid4(), created_at=datetime.now(timezone.utc))
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    db = _db(
        _result(first=(adviser, user)),       # adviser + user row
        _result(school_year),                 # school year by name
        _result(scalars=[]),                  # held program ids
        _result(None),                        # email conflict check
    )

    payload = AdviserUpdateRequest(
        first_name="Augusta",
        last_name="Lovelace",
        email="ada@example.com",
        department_codes=[],
        school_year_name="2026-2027",
    )

    with (
        patch.object(adv_router, "update_user_personal_names", AsyncMock(return_value=("Augusta", "Lovelace"))),
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "reconcile_adviser_program_assignments", AsyncMock(return_value=[])),
        patch.object(adv_router, "get_program_id_to_department_code_map", AsyncMock(return_value={})),
    ):
        await update_adviser(adviser.id, payload, current_user={"sub": "clerk_admin"}, db=db)

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "adviser"
    assert row.entity_id == adviser.id
    assert row.school_year_id == school_year.id
    assert row.previous_values == {"first_name": "Ada"}
    assert row.new_values == {"first_name": "Augusta"}


@pytest.mark.asyncio
async def test_adviser_profile_update_with_no_change_is_not_logged():
    user = _user()
    adviser = SimpleNamespace(id=uuid4(), created_at=datetime.now(timezone.utc))
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    db = _db(
        _result(first=(adviser, user)),
        _result(school_year),
        _result(scalars=[]),
        _result(None),
    )
    payload = AdviserUpdateRequest(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        department_codes=[],
        school_year_name="2026-2027",
    )

    with (
        patch.object(adv_router, "update_user_personal_names", AsyncMock(return_value=("Ada", "Lovelace"))),
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "reconcile_adviser_program_assignments", AsyncMock(return_value=[])),
        patch.object(adv_router, "get_program_id_to_department_code_map", AsyncMock(return_value={})),
    ):
        await update_adviser(adviser.id, payload, current_user={"sub": "clerk_admin"}, db=db)

    assert _audit_rows(db) == []


@pytest.mark.asyncio
async def test_adviser_profile_update_logs_program_change():
    user = _user()
    adviser = SimpleNamespace(id=uuid4(), created_at=datetime.now(timezone.utc))
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    db = _db(
        _result(first=(adviser, user)),
        _result(school_year),
        _result(scalars=[program_uuid_for_department_code("BSIT")]),  # currently BSIT
        _result(SimpleNamespace(is_active=True)),                    # BSCS exists and is active
        _result(None),
    )
    payload = AdviserUpdateRequest(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        department_codes=["BSCS"],
        school_year_name="2026-2027",
    )

    with (
        patch.object(adv_router, "update_user_personal_names", AsyncMock(return_value=("Ada", "Lovelace"))),
        patch.object(adv_router, "fetch_user_lock_status", AsyncMock(return_value=False)),
        patch.object(adv_router, "reconcile_adviser_program_assignments", AsyncMock(return_value=["BSCS"])),
        patch.object(
            adv_router,
            "get_program_id_to_department_code_map",
            AsyncMock(return_value={program_uuid_for_department_code("BSIT"): "BSIT"}),
        ),
    ):
        await update_adviser(adviser.id, payload, current_user={"sub": "clerk_admin"}, db=db)

    row = _single_row(db)
    assert row.previous_values == {"departments": ["BSIT"]}
    assert row.new_values == {"departments": ["BSCS"]}


@pytest.mark.asyncio
@pytest.mark.parametrize("is_active,expected", [(True, "activate"), (False, "deactivate")])
async def test_adviser_status_toggle_is_logged(is_active, expected):
    user = _user()
    adviser = SimpleNamespace(id=uuid4(), user_id=user.id, created_at=datetime.now(timezone.utc))
    db = _db(_result(first=(adviser, user)))

    with (
        patch.object(adv_router, "unlock_user_account", AsyncMock(return_value=False)),
        patch.object(adv_router, "lock_user_account", AsyncMock(return_value=True)),
        patch.object(adv_router, "get_active_school_year_id", AsyncMock(return_value=None)),
        patch.object(adv_router, "get_adviser_departments_map_for_school_year", AsyncMock(return_value={})),
    ):
        await update_adviser_status(
            adviser.id,
            adv_router.AdviserStatusUpdateRequest(is_active=is_active),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    row = _single_row(db)
    assert row.action == expected
    assert row.entity_type == "adviser"
    assert row.new_values == {"is_active": is_active}
    assert row.audit_metadata == {"entity_label": "Ada Lovelace"}
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_adviser_invitation_create_is_logged():
    school_year = SimpleNamespace(id=uuid4(), name="2026-2027", status=SchoolYearStatus.ACTIVE)
    department = SimpleNamespace(id=uuid4(), code="BSIT", is_active=True)
    db = _db(
        _result(school_year),  # school year
        _result(department),   # department
        _result(None),         # no existing user with this email
        _result(None),         # no pending invitation
    )
    clerk_invitation = {"id": "inv_clerk_1", "status": "pending", "url": "https://example.test/i"}

    with (
        patch.object(inv_router, "create_application_invitation", AsyncMock(return_value=clerk_invitation)),
        patch.object(inv_router, "_build_default_invite_redirect_url", return_value="https://example.test"),
        patch.object(inv_router, "_to_response_model", return_value=MagicMock(model_dump=lambda: {})),
        patch.object(inv_router, "AdviserInvitationCreateResponse", MagicMock()),
    ):
        await create_adviser_invitation(
            CreateAdviserInvitationRequest(
                email="new.adviser@example.edu",
                first_name="Juan",
                last_name="Cruz",
                department_code="BSIT",
                school_year_name="2026-2027",
            ),
            current_user={},
            db=db,
        )

    row = _single_row(db)
    assert row.action == "invite"
    assert row.entity_type == "adviser_invitation"
    assert row.school_year_id == school_year.id
    assert row.audit_metadata == {"entity_label": "new.adviser@example.edu"}
    assert row.new_values["department_code"] == "BSIT"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_adviser_invitation_revoke_is_logged():
    invitation = SimpleNamespace(
        id=uuid4(),
        email="pending@example.edu",
        status=AdviserInvitationStatus.PENDING,
        clerk_invitation_id="inv_clerk_2",
        school_year_id=uuid4(),
    )
    db = _db(_result(first=(invitation, "2026-2027")))

    with (
        patch.object(inv_router, "revoke_application_invitation", AsyncMock()),
        patch.object(inv_router, "_to_response_model", return_value={}),
    ):
        await inv_router.revoke_adviser_invitation(invitation.id, current_user={}, db=db)

    row = _single_row(db)
    assert row.action == "revoke"
    assert row.entity_id == invitation.id
    assert row.school_year_id == invitation.school_year_id
    assert row.previous_values == {"status": "pending"}
    assert row.new_values == {"status": "revoked"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "old_role,new_role",
    [
        (UserRole.STUDENT, UserRole.ADVISER),
        (UserRole.ADVISER, UserRole.ADMIN),
        (UserRole.ADMIN, UserRole.STUDENT),
    ],
)
async def test_user_role_change_is_logged_for_each_transition(old_role, new_role):
    user = _user(role=old_role)
    results = [_result(user)]
    if old_role == UserRole.ADMIN and new_role != UserRole.ADMIN:
        results.append(_result(2))  # the last-admin guard counts admins; another admin remains
    db = _db(*results)

    # Clerk is not reachable in tests; the sync itself is covered in test_user_role_clerk_sync.py.
    with patch("app.routers.admin.users.sync_user_role", new=AsyncMock()):
        await update_user_role(str(user.id), UpdateRoleRequest(new_role=new_role.value), {"sub": "clerk_admin"}, db)

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "user_role"
    assert row.entity_id == user.id
    assert row.previous_values == {"role": old_role.value}
    assert row.new_values == {"role": new_role.value}


# ---------- phase 3: academic setup ----------------------------------------

@pytest.mark.asyncio
async def test_department_create_is_logged():
    dept_id = uuid4()
    db = _db(_result(None))  # no existing department with this code

    async def flush():
        db.add.call_args.args[0].id = dept_id

    db.flush = AsyncMock(side_effect=flush)

    with patch.object(dept_router, "_serialize_department", return_value={}):
        await dept_router.create_department(
            dept_router.DepartmentCreateRequest(code="BSCS", name="Computer Science"),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    row = _single_row(db)
    assert row.action == "create"
    assert row.entity_type == "department"
    assert row.entity_id == dept_id
    assert row.new_values == {"code": "BSCS", "name": "Computer Science", "is_active": True}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "update_kwargs,expected_previous,expected_new",
    [
        ({"name": "Information Systems"}, {"name": "Information Technology"}, {"name": "Information Systems"}),
        ({"is_active": False}, {"is_active": True}, {"is_active": False}),
        ({"code": "BSIT2"}, {"code": "BSIT"}, {"code": "BSIT2"}),
    ],
)
async def test_department_update_is_logged_for_each_field(update_kwargs, expected_previous, expected_new):
    from app.routers.admin.departments import DepartmentUpdateRequest

    department = SimpleNamespace(
        id=uuid4(),
        code="BSIT",
        name="Information Technology",
        is_active=True,
    )
    # Code lookups for the rename path return no conflict.
    db = _db(_result(None))
    db.get = AsyncMock(return_value=department)

    with (
        patch.object(dept_router, "_get_department_counts", AsyncMock(return_value=({}, {}))),
        patch.object(dept_router, "_serialize_department", return_value={}),
    ):
        await dept_router.update_department(
            department.id,
            DepartmentUpdateRequest(**update_kwargs),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "department"
    assert row.previous_values == expected_previous
    assert row.new_values == expected_new


@pytest.mark.asyncio
async def test_adviser_department_assignment_is_logged():
    user = _user()
    adviser = SimpleNamespace(id=uuid4(), user_id=user.id, created_at=datetime.now(timezone.utc))
    school_year = SimpleNamespace(id=uuid4(), status=SchoolYearStatus.ACTIVE)
    bsit = program_uuid_for_department_code("BSIT")
    db = _db(
        _result(first=(adviser, user)),          # adviser + user
        _result(scalars=[bsit]),                 # held program ids (BSIT)
        _result(SimpleNamespace(is_active=True)),  # BSCS department lookup
    )
    db.get = AsyncMock(return_value=school_year)

    with (
        patch.object(
            dept_router,
            "get_program_id_to_department_code_map",
            AsyncMock(return_value={bsit: "BSIT", program_uuid_for_department_code("BSCS"): "BSCS"}),
        ),
        patch.object(dept_router, "reconcile_adviser_program_assignments", AsyncMock(return_value=["BSCS"])),
        patch.object(dept_router, "_serialize_adviser", return_value={}),
    ):
        await update_adviser_department(
            adviser.id,
            AdviserDepartmentUpdateRequest(department_codes=["BSCS"], school_year_id=uuid4()),
            current_user={"sub": "clerk_admin"},
            db=db,
        )

    row = _single_row(db)
    assert row.action == "assign"
    assert row.entity_type == "adviser"
    assert row.previous_values == {"departments": ["BSIT"]}
    assert row.new_values == {"departments": ["BSCS"]}
    assert row.audit_metadata == {"entity_label": "Ada Lovelace"}


# ---------- retention policy (every option) --------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize("days", [30, 90, 180, 365, None])
async def test_set_retention_stores_every_option(days):
    settings_row = ActivityLogSettings(id=1, retention_days=365)
    db = _db(_result(settings_row), _result(None))  # existing row, actor lookup

    result = await svc.set_retention_days(db, days, {"sub": "clerk_admin"})

    assert result == days
    assert settings_row.retention_days == days
    row = _single_row(db)
    assert row.action == "update"
    assert row.entity_type == "activity_log_settings"
    assert row.previous_values == {"retention_days": 365}
    assert row.new_values == {"retention_days": days}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_set_retention_creates_row_when_missing_and_reports_default_as_previous():
    db = _db(_result(None), _result(None))

    await svc.set_retention_days(db, 90, {"sub": "clerk_admin"})

    created = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], ActivityLogSettings)]
    assert len(created) == 1 and created[0].retention_days == 90
    assert _single_row(db).previous_values == {"retention_days": svc.DEFAULT_RETENTION_DAYS}


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [0, 7, 45, 366, -30])
async def test_set_retention_rejects_unsupported_values(days):
    db = _db()
    with pytest.raises(HTTPException) as exc:
        await svc.set_retention_days(db, days, {"sub": "clerk_admin"})
    assert exc.value.status_code == 400
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [30, 90, 180, 365])
async def test_manual_purge_every_option_deletes_and_is_audited(days):
    delete_result = MagicMock(rowcount=5)
    db = _db(delete_result, _result(None))

    deleted = await svc.purge_logs_manually(db, days, {"sub": "clerk_admin"})

    assert deleted == 5
    row = _single_row(db)
    assert row.action == "purge"
    assert row.entity_type == "activity_log"
    assert row.new_values == {"older_than_days": days, "deleted_count": 5}
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [0, 7, 45, 400])
async def test_manual_purge_rejects_unsupported_values(days):
    db = _db()
    with pytest.raises(HTTPException) as exc:
        await svc.purge_logs_manually(db, days, {"sub": "clerk_admin"})
    assert exc.value.status_code == 400
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [30, 90, 180, 365])
async def test_startup_retention_deletes_for_every_configured_period(days):
    db = _db(_result(ActivityLogSettings(id=1, retention_days=days)), MagicMock(rowcount=2))

    assert await svc.apply_retention_policy(db) == 2
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_startup_retention_keeps_everything_when_forever():
    db = _db(_result(ActivityLogSettings(id=1, retention_days=None)))

    assert await svc.apply_retention_policy(db) == 0
    assert db.execute.await_count == 1  # only the settings read; no DELETE


@pytest.mark.asyncio
async def test_retention_default_applies_without_a_settings_row():
    db = _db(_result(None))

    assert await svc.get_retention_days(db) == svc.DEFAULT_RETENTION_DAYS


@pytest.mark.asyncio
async def test_fresh_install_without_settings_row_deletes_nothing_on_startup():
    # Regression: an upgraded database has no settings row. Startup must not purge audit history.
    db = _db(_result(None))

    assert svc.DEFAULT_RETENTION_DAYS is None
    assert await svc.apply_retention_policy(db) == 0
    assert db.execute.await_count == 1  # only the settings read; no DELETE
    db.commit.assert_not_awaited()


# ---------- activity list filters (every option) ---------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kwargs,fragment",
    [
        ({"actor_user_id": uuid4()}, "actor_user_id"),
        ({"entity_type": "adviser"}, "entity_type"),
        ({"action": "update"}, "action"),
        ({"date_from": datetime(2026, 10, 1, tzinfo=timezone.utc)}, "created_at >="),
        ({"date_to": datetime(2026, 10, 31, tzinfo=timezone.utc)}, "created_at <="),
        ({"search": "Ada"}, "LIKE"),
    ],
)
async def test_each_activity_log_filter_is_applied(kwargs, fragment):
    db = _db(_result(0), _result(rows=[]))

    await svc.list_activity_logs(db, **kwargs)

    # Both the count query and the page query must carry the filter.
    for call in db.execute.call_args_list:
        assert fragment in str(call.args[0])


@pytest.mark.asyncio
async def test_activity_list_applies_no_filters_when_none_given():
    db = _db(_result(0), _result(rows=[]))

    await svc.list_activity_logs(db)

    for call in db.execute.call_args_list:
        sql = str(call.args[0])
        assert "WHERE" not in sql
