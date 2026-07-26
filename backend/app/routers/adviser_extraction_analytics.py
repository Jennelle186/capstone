from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database import SessionDep
from ..models import UserRole
from ..rbac import require_roles
from ..services.adviser_core import list_adviser_departments, resolve_adviser
from ..services.helpers import get_active_school_year_id
from ..services.admin_analytics import (
    get_canonical_keys as svc_get_canonical_keys,
    get_enrolment_trends as svc_get_enrolment_trends,
    get_extraction_analytics as svc_get_extraction_analytics,
    generate_insights as svc_generate_insights,
    get_trends as svc_get_trends,
)
from ..services.admin_analytics.response import (
    CanonicalKeysResponse,
    EnrolmentResponse,
    SnapshotResponse,
    TrendResponse,
)
from ..services.school_years import list_adviser_school_years as svc_list_school_years

router = APIRouter(prefix="/api/adviser/extraction-analytics", tags=["adviser-extraction-analytics"])

CurrentAdviser = Depends(require_roles(UserRole.ADVISER))


@router.get("/school-years")
async def adviser_school_years(
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")
    years = await svc_list_school_years(db, adviser)
    return years


@router.get("/departments")
async def adviser_departments(
    school_year_id: UUID = Query(...),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")
    departments = await list_adviser_departments(db, adviser, school_year_id)
    return departments


@router.get("/canonical-keys", response_model=CanonicalKeysResponse)
async def adviser_canonical_keys(
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    del current_user
    keys = await svc_get_canonical_keys(db)
    return CanonicalKeysResponse(keys=keys)


@router.get("/snapshot", response_model=SnapshotResponse)
async def adviser_extraction_analytics(
    school_year_id: UUID = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")

    dept_ids = await list_adviser_departments(db, adviser, school_year_id)
    adviser_dept_ids = [UUID(d["id"]) for d in dept_ids]

    if department_id and department_id not in adviser_dept_ids:
        raise HTTPException(status_code=403, detail="Department not assigned to this adviser")

    ids = [department_id] if department_id else adviser_dept_ids
    try:
        result = await svc_get_extraction_analytics(db, school_year_id, department_ids=ids)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SnapshotResponse(**result)


@router.get("/trends", response_model=TrendResponse)
async def adviser_trends(
    keys: str = Query(..., description="Comma-separated canonical keys"),
    from_year: int = Query(...),
    to_year: int = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")

    active_sy_id = await get_active_school_year_id(db)
    if active_sy_id:
        dept_ids = await list_adviser_departments(db, adviser, active_sy_id)
        adviser_dept_ids = [UUID(d["id"]) for d in dept_ids]
        if department_id and department_id not in adviser_dept_ids:
            raise HTTPException(status_code=403, detail="Department not assigned to this adviser")

    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    result = await svc_get_trends(db, key_list, from_year, to_year, department_id=department_id)
    return TrendResponse(**result)


@router.get("/enrolment", response_model=EnrolmentResponse)
async def adviser_enrolment_trends(
    from_year: int = Query(...),
    to_year: int = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")

    active_sy_id = await get_active_school_year_id(db)
    if active_sy_id:
        dept_ids = await list_adviser_departments(db, adviser, active_sy_id)
        adviser_dept_ids = [UUID(d["id"]) for d in dept_ids]
        if department_id and department_id not in adviser_dept_ids:
            raise HTTPException(status_code=403, detail="Department not assigned to this adviser")

    result = await svc_get_enrolment_trends(db, from_year, to_year, department_id=department_id)
    return EnrolmentResponse(**result)


@router.post("/insights")
async def adviser_insights(
    school_year_id: UUID = Query(...),
    department_id: UUID | None = Query(None),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
):
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(status_code=404, detail="Adviser not found")

    dept_ids = await list_adviser_departments(db, adviser, school_year_id)
    adviser_dept_ids = [UUID(d["id"]) for d in dept_ids]

    if department_id and department_id not in adviser_dept_ids:
        raise HTTPException(status_code=403, detail="Department not assigned to this adviser")

    ids = [department_id] if department_id else adviser_dept_ids
    summary = await svc_generate_insights(db, school_year_id, department_ids=ids)
    return {"summary": summary}
