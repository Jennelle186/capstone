"""Shared writer for the admin activity log (``admin_audit_logs``).

Every admin-side change should call :func:`record_activity` inside the same
transaction as the change itself. The helper only ``db.add``s the row; the
caller's commit (or rollback) decides whether the log entry is kept.
"""

from __future__ import annotations

import logging
from datetime import date
from enum import Enum
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, func, or_, select

from ..database import SessionDep
from ..models import ActivityLogSettings, AdminAuditLog, User
from ..schemas.activity_logs import ActivityLogItem

# Entity types recognised by the Activity Logs page. Keep in sync with the
# frontend filter options in ``front-end/src/types/activityLog.ts``.
ENTITY_TYPES = frozenset(
    {
        "adviser",
        "adviser_invitation",
        "admin",
        "user_role",
        "department",
        "school_year",
        "document_type",
        "requirement",
        "requirement_slot",
        "extraction_schema",
        "form",
        "branding",
        "analytics_dimension",
        "gcs_cleanup",
        "activity_log",
        "activity_log_settings",
    }
)


def actor_display_name(user: User | None, fallback: str | None = None) -> str | None:
    """Full name, then email, then ``fallback``. Mirrors the school-year display rule."""
    if user is None:
        return fallback
    parts = [
        (user.first_name or "").strip(),
        (user.middle_name or "").strip(),
        (user.last_name or "").strip(),
    ]
    full_name = " ".join(part for part in parts if part)
    if full_name:
        return full_name
    return user.email or fallback


async def _resolve_actor(db: SessionDep, current_user: dict | None) -> User | None:
    clerk_user_id = current_user.get("sub") if current_user else None
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        return None
    # Exactly one query per log entry; several existing tests depend on this.
    stmt = select(User).where(User.clerk_user_id == clerk_user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


def queue_audit_row(
    db: SessionDep,
    current_user: dict | None,
    actor: User | None,
    *,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    entity_label: str | None = None,
    school_year_id: UUID | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    extra_metadata: dict | None = None,
) -> AdminAuditLog:
    """Add an audit row for an already-resolved actor. Does not query or commit."""
    clerk_user_id = current_user.get("sub") if current_user else None
    if not isinstance(clerk_user_id, str):
        clerk_user_id = None

    metadata: dict = dict(extra_metadata or {})
    if entity_label:
        metadata["entity_label"] = entity_label

    row = AdminAuditLog(
        action=action.lower(),
        entity_type=entity_type,
        entity_id=entity_id,
        school_year_id=school_year_id,
        actor_user_id=actor.id if actor else None,
        actor_clerk_user_id=clerk_user_id,
        actor_name=actor_display_name(actor, fallback=clerk_user_id),
        actor_email=actor.email if actor else None,
        actor_role=actor.role.value if actor and actor.role else None,
        previous_values=previous_values,
        new_values=new_values,
        audit_metadata=metadata or None,
    )
    db.add(row)
    return row


async def record_activity(
    db: SessionDep,
    current_user: dict | None,
    *,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    entity_label: str | None = None,
    school_year_id: UUID | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    extra_metadata: dict | None = None,
) -> AdminAuditLog:
    """Queue an audit row for the acting admin, resolving the actor with one query.

    The actor's name, email and role are copied onto the row so the entry still
    reads correctly if the user is later renamed or deleted. ``entity_label`` is
    the human-readable name of the affected item and is stored in
    ``audit_metadata``. Do not pass secrets, tokens or signed URLs here.
    """
    actor = await _resolve_actor(db, current_user)
    return queue_audit_row(
        db,
        current_user,
        actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        school_year_id=school_year_id,
        previous_values=previous_values,
        new_values=new_values,
        extra_metadata=extra_metadata,
    )


ACTIVITY_LOG_MAX_PAGE_SIZE = 100


def _apply_filters(
    stmt,
    *,
    actor_user_id: UUID | None,
    entity_type: str | None,
    action: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    search: str | None,
):
    if actor_user_id is not None:
        stmt = stmt.where(AdminAuditLog.actor_user_id == actor_user_id)
    if entity_type:
        stmt = stmt.where(AdminAuditLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(AdminAuditLog.action == action.lower())
    if date_from is not None:
        stmt = stmt.where(AdminAuditLog.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(AdminAuditLog.created_at <= date_to)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                AdminAuditLog.actor_name.ilike(pattern),
                AdminAuditLog.actor_email.ilike(pattern),
                AdminAuditLog.audit_metadata["entity_label"].astext.ilike(pattern),
            )
        )
    return stmt


async def list_activity_logs(
    db: SessionDep,
    *,
    skip: int = 0,
    limit: int = 25,
    actor_user_id: UUID | None = None,
    entity_type: str | None = None,
    action: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
) -> tuple[list[tuple[AdminAuditLog, User | None]], int]:
    """Return one page of activity rows (newest first) and the total match count.

    The actor is outer-joined so rows whose user was deleted still appear.
    """
    limit = max(1, min(limit, ACTIVITY_LOG_MAX_PAGE_SIZE))
    filters = dict(
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        action=action,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )

    count_stmt = _apply_filters(select(func.count(AdminAuditLog.id)), **filters)
    total = (await db.execute(count_stmt)).scalar_one()

    page_stmt = _apply_filters(
        select(AdminAuditLog, User).outerjoin(User, AdminAuditLog.actor_user_id == User.id),
        **filters,
    )
    page_stmt = (
        page_stmt.order_by(desc(AdminAuditLog.created_at), desc(AdminAuditLog.id))
        .offset(max(skip, 0))
        .limit(limit)
    )
    rows = (await db.execute(page_stmt)).all()
    return [(log, user) for log, user in rows], int(total)


def to_activity_log_item(log: AdminAuditLog, user: User | None) -> ActivityLogItem:
    metadata = log.audit_metadata or {}
    return ActivityLogItem(
        id=str(log.id),
        action=(log.action or "").lower(),
        entity_type=log.entity_type,
        entity_id=str(log.entity_id) if log.entity_id else None,
        entity_label=metadata.get("entity_label"),
        school_year_id=str(log.school_year_id) if log.school_year_id else None,
        actor_user_id=str(log.actor_user_id) if log.actor_user_id else None,
        actor_clerk_user_id=log.actor_clerk_user_id,
        # Older rows were written before actor_name was filled, so fall back to the live user row.
        actor_name=log.actor_name or actor_display_name(user, fallback=log.actor_clerk_user_id),
        actor_email=log.actor_email or (user.email if user else None),
        actor_role=log.actor_role or (user.role.value if user and user.role else None),
        previous_values=log.previous_values,
        new_values=log.new_values,
        created_at=log.created_at,
    )


def diff_values(before: dict, after: dict) -> tuple[dict | None, dict | None]:
    """Return (previous, new) containing only the keys whose values changed.

    Returns (None, None) when nothing changed, so callers can skip logging a no-op.
    """
    previous: dict = {}
    new: dict = {}
    for key in before.keys() | after.keys():
        if before.get(key) != after.get(key):
            previous[key] = before.get(key)
            new[key] = after.get(key)
    if not previous:
        return None, None
    return previous, new


logger = logging.getLogger(__name__)

# Retention periods an admin can choose, in days. None means keep forever.
RETENTION_OPTIONS_DAYS: tuple[int, ...] = (30, 90, 180, 365)
# No settings row means no period has been chosen, so nothing is purged automatically.
# Startup purging only starts after an admin saves a period.
DEFAULT_RETENTION_DAYS: int | None = None
ACTIVITY_LOG_SETTINGS_ID = 1


async def get_retention_days(db: SessionDep) -> int | None:
    """Configured retention in days. A missing settings row means the default applies."""
    stmt = select(ActivityLogSettings).where(ActivityLogSettings.id == ACTIVITY_LOG_SETTINGS_ID)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return DEFAULT_RETENTION_DAYS
    return row.retention_days


async def set_retention_days(db: SessionDep, retention_days: int | None, current_user: dict) -> int | None:
    """Store the retention policy and audit the change. Commits."""
    if retention_days is not None and retention_days not in RETENTION_OPTIONS_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Retention must be one of 30, 90, 180 or 365 days, or kept forever.",
        )

    stmt = select(ActivityLogSettings).where(ActivityLogSettings.id == ACTIVITY_LOG_SETTINGS_ID)
    row = (await db.execute(stmt)).scalar_one_or_none()
    previous = DEFAULT_RETENTION_DAYS if row is None else row.retention_days
    if row is None:
        row = ActivityLogSettings(id=ACTIVITY_LOG_SETTINGS_ID)
        db.add(row)

    actor = await _resolve_actor(db, current_user)
    row.retention_days = retention_days
    row.updated_by_user_id = actor.id if actor else None
    row.updated_at = func.now()

    queue_audit_row(
        db,
        current_user,
        actor,
        action="update",
        entity_type="activity_log_settings",
        entity_label="Activity log retention",
        previous_values={"retention_days": previous},
        new_values={"retention_days": retention_days},
    )
    await db.commit()
    return retention_days


async def purge_activity_logs_older_than(db: SessionDep, days: int) -> int:
    """Delete audit rows older than ``days``. Does not commit; the caller decides."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(delete(AdminAuditLog).where(AdminAuditLog.created_at < cutoff))
    return result.rowcount or 0


async def purge_logs_manually(db: SessionDep, days: int, current_user: dict) -> int:
    """Admin-triggered purge. Records the purge itself so the deletion is traceable."""
    if days not in RETENTION_OPTIONS_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose 30, 90, 180 or 365 days.",
        )
    deleted = await purge_activity_logs_older_than(db, days)
    await record_activity(
        db,
        current_user,
        action="purge",
        entity_type="activity_log",
        entity_label=f"Logs older than {days} days",
        new_values={"older_than_days": days, "deleted_count": deleted},
    )
    await db.commit()
    return deleted


async def apply_retention_policy(db: SessionDep) -> int:
    """Startup housekeeping: delete logs past the configured retention. Returns rows deleted."""
    days = await get_retention_days(db)
    if days is None:
        return 0
    deleted = await purge_activity_logs_older_than(db, days)
    await db.commit()
    if deleted:
        logger.info("Activity log retention removed %s rows older than %s days.", deleted, days)
    return deleted


def plain(value):
    """Convert enums, UUIDs, dates and nested containers into JSON-safe values for audit JSON."""
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [plain(v) for v in value]
    return value
