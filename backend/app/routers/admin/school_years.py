from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from ...database import SessionDep
from ...rbac import require_admin
from ...schemas.school_years import (
    SchoolYearActivationPreviewResponse,
    SchoolYearAuditLogResponse,
    SchoolYearAutoClosureResponse,
    SchoolYearCreateRequest,
    SchoolYearDepartmentAssignmentResponse,
    SchoolYearResponse,
    SchoolYearRolloverRequest,
    SchoolYearUpdateRequest,
)
from ...services import school_years as school_year_service

router = APIRouter(prefix="/school-years")


@router.get("/export.csv")
async def export_school_years_csv(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    csv_content = await school_year_service.build_school_years_csv(db)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="school-years.csv"'},
    )


@router.post("/run-auto-closure", response_model=SchoolYearAutoClosureResponse)
async def run_auto_closure(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.run_auto_closure(db, current_user)


@router.get("", response_model=list[SchoolYearResponse])
async def list_school_years(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await school_year_service.list_school_years(db)


@router.get("/active", response_model=SchoolYearResponse | None)
async def get_active_school_year(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await school_year_service.get_active_school_year(db)


@router.get("/{school_year_id}/assignments", response_model=list[SchoolYearDepartmentAssignmentResponse])
async def list_school_year_assignments(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await school_year_service.list_school_year_assignments(db, school_year_id)


@router.get("/{school_year_id}/activation-preview", response_model=SchoolYearActivationPreviewResponse)
async def get_activation_preview(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await school_year_service.get_activation_preview(db, school_year_id)


@router.get("/{school_year_id}/audit-logs", response_model=list[SchoolYearAuditLogResponse])
async def list_school_year_audit_logs(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return await school_year_service.list_school_year_audit_logs(db, school_year_id)


@router.post("", response_model=SchoolYearResponse, status_code=status.HTTP_201_CREATED)
async def create_school_year(
    payload: SchoolYearCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.create_school_year(db, payload, current_user)


@router.patch("/{school_year_id}", response_model=SchoolYearResponse)
async def update_school_year(
    school_year_id: UUID,
    payload: SchoolYearUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.update_school_year(db, school_year_id, payload, current_user)


@router.post("/{school_year_id}/set-active", response_model=SchoolYearResponse)
async def set_school_year_active(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.set_school_year_active(db, school_year_id, current_user)


@router.post("/{school_year_id}/close", response_model=SchoolYearResponse)
async def close_school_year(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.close_school_year(db, school_year_id, current_user)


@router.post("/{school_year_id}/reopen", response_model=SchoolYearResponse)
async def reopen_school_year(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.reopen_school_year(db, school_year_id, current_user)


@router.post("/{school_year_id}/set-inactive", response_model=SchoolYearResponse)
async def set_school_year_inactive(
    school_year_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.set_school_year_inactive(db, school_year_id, current_user)


@router.post("/{school_year_id}/rollover", response_model=SchoolYearResponse, status_code=status.HTTP_201_CREATED)
async def rollover_school_year(
    school_year_id: UUID,
    payload: SchoolYearRolloverRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    return await school_year_service.rollover_school_year(db, school_year_id, payload, current_user)
