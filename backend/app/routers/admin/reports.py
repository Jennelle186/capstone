from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from ...database import SessionDep
from ...rbac import require_admin
from ...services import analytics_report_service
from ...services import report_service

router = APIRouter()

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/reports/students.xlsx")
async def export_students_xlsx(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Download a multi-sheet XLSX report of all students with document-verification status.

    One sheet per school year, ordered active → most recent → oldest.
    """
    del current_user
    content = await report_service.build_students_xlsx(db)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="student-report.xlsx"'},
    )


@router.get("/reports/advisers.xlsx")
async def export_advisers_xlsx(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Download a multi-sheet XLSX report of all advisers with per-department assignment counts.

    One sheet per school year, ordered active → most recent → oldest.
    """
    del current_user
    content = await report_service.build_advisers_xlsx(db)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="adviser-report.xlsx"'},
    )


@router.get("/reports/document-requirements.xlsx")
async def export_document_requirements_xlsx(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Download a multi-sheet XLSX report of document types, extraction schemas, and schema status.

    One sheet per school year, ordered active → most recent → oldest.
    """
    del current_user
    content = await report_service.build_document_requirements_xlsx(db)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": 'attachment; filename="document-requirements-report.xlsx"'
        },
    )


@router.get("/reports/analytics.xlsx")
async def export_analytics_xlsx(
    school_year_ids: str = Query(..., description="Comma-separated school-year UUIDs"),
    department_id: str | None = Query(None, description="Optional department UUID filter"),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Download a multi-sheet XLSX analytics report with field distributions,
    numeric summaries, document compliance, and canonical key registry."""
    del current_user
    sy_ids = [s.strip() for s in school_year_ids.split(",") if s.strip()]
    content = await analytics_report_service.build_analytics_xlsx(db, sy_ids, department_id)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="analytics-report.xlsx"'},
    )
