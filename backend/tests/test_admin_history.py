from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models import AdviserInvitationStatus, UserRole
from app.services.admin_history import build_admin_history

T0 = datetime(2026, 10, 1, tzinfo=timezone.utc)


def _at(days: int) -> datetime:
    return T0 + timedelta(days=days)


def _invitation(email, *, days, status=AdviserInvitationStatus.PENDING, accepted_days=None, inv_id=None, name=None):
    return SimpleNamespace(
        id=inv_id or uuid4(),
        email=email,
        first_name=name,
        middle_name=None,
        last_name=None,
        status=status,
        created_at=_at(days),
        accepted_at=_at(accepted_days) if accepted_days is not None else None,
    )


def _log(action, *, days, entity_id=None, actor_name="Anton Lee", new_values=None, label=None):
    return SimpleNamespace(
        action=action,
        entity_type="admin",
        entity_id=entity_id,
        created_at=_at(days),
        actor_name=actor_name,
        new_values=new_values,
        audit_metadata={"entity_label": label} if label else None,
    )


def _user(email, role, user_id=None):
    return SimpleNamespace(id=user_id or uuid4(), email=email, role=role)


def _person(history, email):
    matches = [p for p in history if p.email == email]
    assert len(matches) == 1, f"expected one entry for {email}, got {len(matches)}"
    return matches[0]


def test_invited_then_removed_admin_is_still_listed_with_their_email():
    """Directly invited admin: the account is deleted on removal, so the email lives only in the log."""
    inv_id = uuid4()
    history = build_admin_history(
        invitations=[_invitation("new.admin@example.edu", days=1, status=AdviserInvitationStatus.ACCEPTED,
                                 accepted_days=2, inv_id=inv_id)],
        audit_rows=[
            _log("admin_invite", days=1, entity_id=inv_id, actor_name="Anton Lee", label="new.admin@example.edu"),
            _log("admin_remove", days=5, entity_id=uuid4(), label="New Admin",
                 new_values={"removed_from_system": True, "email": "new.admin@example.edu"}),
        ],
        users=[],  # the account was deleted
    )

    person = _person(history, "new.admin@example.edu")
    assert person.status == "removed"
    assert [e.type for e in person.events] == ["invited", "accepted", "removed"]
    assert person.events[0].actor_name == "Anton Lee"
    assert person.events[-1].actor_name == "Anton Lee"


def test_reinvited_admin_shows_both_stints_and_is_invited_again():
    first_inv, second_inv = uuid4(), uuid4()
    history = build_admin_history(
        invitations=[
            _invitation("again@example.edu", days=1, status=AdviserInvitationStatus.ACCEPTED, accepted_days=1, inv_id=first_inv),
            _invitation("again@example.edu", days=10, inv_id=second_inv),
        ],
        audit_rows=[
            _log("admin_remove", days=5, entity_id=uuid4(), new_values={"email": "again@example.edu"}),
        ],
        users=[],
    )

    person = _person(history, "again@example.edu")
    assert person.status == "invited"
    assert [e.type for e in person.events] == ["invited", "accepted", "removed", "invited"]


def test_promoted_adviser_who_is_demoted_back_to_adviser_is_listed_as_demoted():
    user_id = uuid4()
    history = build_admin_history(
        invitations=[],
        audit_rows=[
            _log("admin_promote", days=2, entity_id=user_id, label="Ada Lovelace"),
            _log("admin_demote", days=4, entity_id=user_id, label="Ada Lovelace",
                 new_values={"role": "adviser", "email": "ada@example.edu"}),
        ],
        users=[_user("ada@example.edu", UserRole.ADVISER, user_id=user_id)],
    )

    person = _person(history, "ada@example.edu")
    assert person.status == "demoted"
    assert [e.type for e in person.events] == ["promoted", "demoted"]
    assert person.name == "Ada Lovelace"


def test_legacy_admin_remove_that_restored_an_adviser_is_still_read_as_demoted():
    # Rows written before admin_demote existed used admin_remove for this case.
    user_id = uuid4()
    history = build_admin_history(
        invitations=[],
        audit_rows=[
            _log("admin_promote", days=2, entity_id=user_id, label="Ada Lovelace"),
            _log("admin_remove", days=4, entity_id=user_id, label="Ada Lovelace",
                 new_values={"role": "adviser", "email": "ada@example.edu"}),
        ],
        users=[_user("ada@example.edu", UserRole.ADVISER, user_id=user_id)],
    )

    person = _person(history, "ada@example.edu")
    assert person.status == "demoted"
    assert [e.type for e in person.events] == ["promoted", "demoted"]


def test_deleted_administrator_is_still_listed_as_removed():
    history = build_admin_history(
        invitations=[],
        audit_rows=[
            _log("admin_remove", days=1, entity_id=uuid4(), label="Gone Admin",
                 new_values={"removed_from_system": True, "email": "gone@example.edu"}),
        ],
        users=[],
    )

    person = _person(history, "gone@example.edu")
    assert person.status == "removed"


def test_current_admin_is_marked_admin():
    user_id = uuid4()
    history = build_admin_history(
        invitations=[],
        audit_rows=[_log("admin_promote", days=3, entity_id=user_id, label="Grace Hopper")],
        users=[_user("grace@example.edu", UserRole.ADMIN, user_id=user_id)],
    )

    person = _person(history, "grace@example.edu")
    assert person.status == "admin"
    assert [e.type for e in person.events] == ["promoted"]


def test_revoked_invitation_is_listed_as_revoked():
    inv_id = uuid4()
    history = build_admin_history(
        invitations=[_invitation("revoked@example.edu", days=1, status=AdviserInvitationStatus.REVOKED, inv_id=inv_id)],
        audit_rows=[_log("revoke", days=3, entity_id=inv_id, label="revoked@example.edu")],
        users=[],
    )

    person = _person(history, "revoked@example.edu")
    assert person.status == "revoked"
    assert [e.type for e in person.events] == ["invited", "revoked"]


def test_pending_invitation_is_listed_as_invited():
    history = build_admin_history(
        invitations=[_invitation("pending@example.edu", days=1)],
        audit_rows=[],
        users=[],
    )

    person = _person(history, "pending@example.edu")
    assert person.status == "invited"
    assert [e.type for e in person.events] == ["invited"]


def test_people_are_ordered_most_recent_activity_first():
    history = build_admin_history(
        invitations=[
            _invitation("older@example.edu", days=1),
            _invitation("newer@example.edu", days=9),
        ],
        audit_rows=[],
        users=[],
    )

    assert [p.email for p in history] == ["newer@example.edu", "older@example.edu"]


def test_email_matching_ignores_case():
    history = build_admin_history(
        invitations=[_invitation("Mixed@Example.edu", days=1)],
        audit_rows=[_log("admin_remove", days=2, entity_id=uuid4(), new_values={"email": "mixed@example.edu"})],
        users=[],
    )

    assert len(history) == 1
    # The invitation is still pending, so the status is "invited" even though a removal is logged.
    assert history[0].status == "invited"
    assert [e.type for e in history[0].events] == ["invited", "removed"]


def test_invite_log_rows_are_not_duplicated_as_events():
    inv_id = uuid4()
    history = build_admin_history(
        invitations=[_invitation("once@example.edu", days=1, inv_id=inv_id)],
        audit_rows=[_log("admin_invite", days=1, entity_id=inv_id, label="once@example.edu")],
        users=[],
    )

    assert [e.type for e in _person(history, "once@example.edu").events] == ["invited"]
