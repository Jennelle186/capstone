from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ...database import SessionDep
from ...rbac import require_admin
from ...services.admin_analytics import (
    get_canonical_keys as svc_get_canonical_keys,
    get_dashboard_kpi as svc_get_dashboard_kpi,
    get_enrolment_trends as svc_get_enrolment_trends,
    get_extraction_analytics as svc_get_extraction_analytics,
    generate_insights as svc_generate_insights,
    get_trends as svc_get_trends,
)
from ...services.admin_analytics.response import (
    CanonicalKeysResponse,
    DashboardKPIResponse,
    EnrolmentResponse,
    SnapshotResponse,
    TrendResponse,
)

router = APIRouter(prefix="/analytics", tags=["admin-analytics"])


@router.get("/canonical-keys", response_model=CanonicalKeysResponse)
async def canonical_keys(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    keys = await svc_get_canonical_keys(db)
    return CanonicalKeysResponse(keys=keys)


@router.get("/extractions", response_model=SnapshotResponse)
async def extraction_analytics(
    school_year_id: UUID = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    try:
        result = await svc_get_extraction_analytics(db, school_year_id, department_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SnapshotResponse(**result)


@router.get("/trends", response_model=TrendResponse)
async def trends(
    keys: str = Query(..., description="Comma-separated canonical keys"),
    from_year: int = Query(...),
    to_year: int = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    result = await svc_get_trends(db, key_list, from_year, to_year, department_id)
    return TrendResponse(**result)


@router.get("/enrolment", response_model=EnrolmentResponse)
async def enrolment_trends(
    from_year: int = Query(...),
    to_year: int = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    result = await svc_get_enrolment_trends(db, from_year, to_year, department_id)
    return EnrolmentResponse(**result)


@router.post("/insights")
async def insights(
    school_year_id: UUID = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    summary = await svc_generate_insights(db, school_year_id, department_id)
    return {"summary": summary}


@router.get("/dashboard", response_model=DashboardKPIResponse)
async def dashboard_kpi(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    result = await svc_get_dashboard_kpi(db)
    return DashboardKPIResponse(**result)
