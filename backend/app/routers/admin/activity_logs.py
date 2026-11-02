from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...database import SessionDep
from ...rbac import require_admin
from ...schemas.activity_log_retention import (
    OlderThanCountResponse,
    PurgeRequest,
    PurgeResponse,
    RetentionSettingsResponse,
    RetentionUpdateRequest,
)
from ...schemas.activity_logs import ActivityLogListResponse
from ...services.activity_log import (
    RETENTION_OPTIONS_DAYS,
    count_activity_logs_older_than,
    get_retention_days,
    list_activity_logs,
    purge_logs_manually,
    set_retention_days,
    to_activity_log_item,
)

router = APIRouter(prefix="/activity-logs")


@router.get("", response_model=ActivityLogListResponse)
async def get_activity_logs(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    actor_user_id: UUID | None = Query(None),
    entity_type: str | None = Query(None, max_length=30),
    action: str | None = Query(None, max_length=50),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    search: str | None = Query(None, max_length=200),
):
    # Read-only, newest first. Available to any admin; no per-row scoping.
    del current_user

    rows, total = await list_activity_logs(
        db,
        skip=skip,
        limit=limit,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        action=action,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    return ActivityLogListResponse(
        items=[to_activity_log_item(log, user) for log, user in rows],
        total=total,
    )


@router.get("/settings", response_model=RetentionSettingsResponse)
async def get_retention_settings(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return RetentionSettingsResponse(
        retention_days=await get_retention_days(db),
        options=list(RETENTION_OPTIONS_DAYS),
    )


@router.put("/settings", response_model=RetentionSettingsResponse)
async def update_retention_settings(
    payload: RetentionUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    retention_days = await set_retention_days(db, payload.retention_days, current_user)
    return RetentionSettingsResponse(
        retention_days=retention_days,
        options=list(RETENTION_OPTIONS_DAYS),
    )


@router.post("/purge", response_model=PurgeResponse)
async def purge_old_activity_logs(
    payload: PurgeRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    deleted = await purge_logs_manually(db, payload.older_than_days, current_user)
    return PurgeResponse(deleted=deleted)


@router.get("/older-than", response_model=OlderThanCountResponse)
async def count_logs_older_than(
    days: int = Query(..., description="Retention period in days: 30, 90, 180 or 365."),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Read-only. The admin UI shows this count in the confirmation before any deletion.
    del current_user
    if days not in RETENTION_OPTIONS_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose 30, 90, 180 or 365 days.",
        )
    return OlderThanCountResponse(days=days, count=await count_activity_logs_older_than(db, days))
