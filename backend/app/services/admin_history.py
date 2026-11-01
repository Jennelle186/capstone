"""Administrator history: one timeline per person, built from admin invitations and
the admin activity log. Removed admins are found by the email stored at removal."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import select

from ..database import SessionDep
from ..models import AdminAuditLog, AdminInvitation, AdviserInvitationStatus, User, UserRole
from ..schemas.admin_history import AdminHistoryEvent, AdminHistoryPerson


def _key(email: str | None, fallback: str) -> str:
    return email.strip().lower() if email else f"name:{fallback.lower()}"


def _event_from_log(log: AdminAuditLog, event_type: str) -> AdminHistoryEvent:
    return AdminHistoryEvent(type=event_type, at=log.created_at, actor_name=log.actor_name)


def build_admin_history(
    invitations: Iterable[Any],
    audit_rows: Iterable[Any],
    users: Iterable[Any],
) -> list[AdminHistoryPerson]:
    """Pure function over already-loaded rows. Each argument is a list of rows:
    invitations (AdminInvitation), audit_rows (AdminAuditLog with entity_type 'admin'),
    users (objects with id, email, role)."""
    invitations = list(invitations)
    audit_rows = sorted(audit_rows, key=lambda row: row.created_at)
    users = list(users)

    email_by_user_id = {user.id: user.email for user in users if user.email}
    active_admin_keys = {_key(user.email, "") for user in users if user.role == UserRole.ADMIN and user.email}
    email_by_invitation_id = {inv.id: inv.email for inv in invitations}
    invited_by_name = {row.entity_id: row.actor_name for row in audit_rows if row.action == "admin_invite"}

    people: dict[str, dict[str, Any]] = {}

    def person(key: str, email: str | None, name: str | None) -> dict[str, Any]:
        entry = people.setdefault(key, {"email": None, "name": None, "events": [], "last_label": None})
        if email and not entry["email"]:
            entry["email"] = email
        if name and name != entry["email"]:
            entry["name"] = name
        return entry

    for inv in invitations:
        name = " ".join(part for part in (inv.first_name, inv.middle_name, inv.last_name) if part) or None
        entry = person(_key(inv.email, name or ""), inv.email, name)
        entry["events"].append(AdminHistoryEvent(type="invited", at=inv.created_at, actor_name=invited_by_name.get(inv.id)))
        if inv.accepted_at is not None:
            entry["events"].append(AdminHistoryEvent(type="accepted", at=inv.accepted_at, actor_name=None))

    for log in audit_rows:
        details = log.new_values or {}
        if log.action == "admin_invite":
            continue  # covered by the invitation row above
        if log.action == "revoke":
            email = email_by_invitation_id.get(log.entity_id) or details.get("email")
            event_type = "revoked"
        elif log.action == "admin_promote":
            email = email_by_user_id.get(log.entity_id) or details.get("email")
            event_type = "promoted"
        elif log.action == "admin_remove":
            email = details.get("email") or email_by_user_id.get(log.entity_id)
            event_type = "removed"
        else:
            continue

        label = (log.audit_metadata or {}).get("entity_label")
        name = label if label and label != email else None
        entry = person(_key(email, label or ""), email, name)
        entry["events"].append(_event_from_log(log, event_type))

    result: list[AdminHistoryPerson] = []
    for key, entry in people.items():
        events = sorted(entry["events"], key=lambda event: event.at)
        pending = any(
            inv.status == AdviserInvitationStatus.PENDING and _key(inv.email, "") == key for inv in invitations
        )
        if key in active_admin_keys:
            status = "admin"
        elif pending:
            status = "invited"
        elif events and events[-1].type == "revoked":
            status = "revoked"
        else:
            status = "removed"
        result.append(
            AdminHistoryPerson(email=entry["email"], name=entry["name"], status=status, events=events)
        )

    result.sort(key=lambda person_row: person_row.events[-1].at if person_row.events else datetime.min, reverse=True)
    return result


async def get_admin_history(db: SessionDep) -> list[AdminHistoryPerson]:
    invitations = (await db.execute(select(AdminInvitation))).scalars().all()
    audit_rows = (
        await db.execute(select(AdminAuditLog).where(AdminAuditLog.entity_type == "admin"))
    ).scalars().all()
    users = (await db.execute(select(User.id, User.email, User.role))).all()
    return build_admin_history(invitations, audit_rows, users)
