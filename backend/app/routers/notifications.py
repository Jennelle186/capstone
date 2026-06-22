from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, select, update

from ..auth import get_current_user
from ..database import SessionDep
from ..models import Notification, User
from typing_extensions import Annotated

router = APIRouter(tags=["notifications"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    message: str
    reference_id: str | None
    is_read: bool
    created_at: str


class UnreadCountOut(BaseModel):
    count: int


async def _resolve_local_user_id(db: SessionDep, clerk_user_id: str) -> uuid.UUID | None:
    result = await db.execute(select(User.id).where(User.clerk_user_id == clerk_user_id))
    row = result.scalar_one_or_none()
    return row


@router.get("/api/notifications", response_model=list[NotificationOut])
async def list_notifications(
    current_user: CurrentUser,
    db: SessionDep,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[NotificationOut]:
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(401, "Not authenticated")

    local_user_id = await _resolve_local_user_id(db, clerk_user_id)
    if local_user_id is None:
        return []

    stmt = (
        select(Notification)
        .where(Notification.recipient_id == local_user_id)
        .order_by(desc(Notification.created_at))
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    return [
        NotificationOut(
            id=str(n.id),
            type=n.notification_type,
            title=n.title,
            message=n.message,
            reference_id=str(n.reference_id) if n.reference_id else None,
            is_read=n.is_read,
            created_at=n.created_at.isoformat() if n.created_at else "",
        )
        for n in notifications
    ]


@router.get("/api/notifications/unread-count", response_model=UnreadCountOut)
async def unread_count(current_user: CurrentUser, db: SessionDep) -> UnreadCountOut:
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(401, "Not authenticated")

    local_user_id = await _resolve_local_user_id(db, clerk_user_id)
    if local_user_id is None:
        return UnreadCountOut(count=0)

    stmt = select(func.count()).where(
        Notification.recipient_id == local_user_id,
        Notification.is_read == False,
    )
    result = await db.execute(stmt)
    count = result.scalar() or 0
    return UnreadCountOut(count=count)


@router.patch("/api/notifications/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: CurrentUser,
    db: SessionDep,
) -> dict:
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(401, "Not authenticated")

    local_user_id = await _resolve_local_user_id(db, clerk_user_id)
    if local_user_id is None:
        raise HTTPException(404, "Notification not found")

    try:
        nid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(400, "Invalid notification ID")

    notification = await db.get(Notification, nid)
    if notification is None or notification.recipient_id != local_user_id:
        raise HTTPException(404, "Notification not found")

    notification.is_read = True
    await db.commit()
    return {"ok": True}


@router.patch("/api/notifications/read-all")
async def mark_all_as_read(current_user: CurrentUser, db: SessionDep) -> dict:
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(401, "Not authenticated")

    local_user_id = await _resolve_local_user_id(db, clerk_user_id)
    if local_user_id is None:
        return {"ok": True}

    stmt = (
        update(Notification)
        .where(Notification.recipient_id == local_user_id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"ok": True}
