from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import desc, select

from ..database import SessionDep
from ..models import Department, SchoolYear


# ─── Pure helpers ────────────────────────────────────────────────────────────

def compute_initials(first_name: str | None, last_name: str | None) -> str:
    f = (first_name or "")[:1]
    l = (last_name or "")[:1]
    return (f + l).upper() or "?"


def relative_time(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return "Just now"
    if seconds < 3600:
        m = seconds // 60
        return f"{m}m ago"
    if seconds < 86400:
        h = seconds // 3600
        return f"{h}h ago"
    if seconds < 604800:
        d = seconds // 86400
        return f"{d}d ago"
    return dt.strftime("%b %d")


# ─── Shared DB utilities (relocated from routers/admin/program_assignment.py) ─

PROGRAM_UUID_NAMESPACE = uuid.UUID("e40ec4af-aa57-47e2-9169-cc4f1f6d03ff")


def program_uuid_for_department_code(department_code: str) -> UUID:
    return uuid.uuid5(PROGRAM_UUID_NAMESPACE, department_code.strip().upper())


async def get_active_school_year_id(db: SessionDep) -> UUID | None:
    stmt = (
        select(SchoolYear.id)
        .where(SchoolYear.is_active.is_(True))
        .order_by(desc(SchoolYear.updated_at))
    )
    return (await db.execute(stmt)).scalars().first()


async def get_program_id_to_department_code_map(db: SessionDep) -> dict[UUID, str]:
    departments_stmt = select(Department.code)
    department_codes = (await db.execute(departments_stmt)).scalars().all()

    return {
        program_uuid_for_department_code(code): code
        for code in department_codes
    }
