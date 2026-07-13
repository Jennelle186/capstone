from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ...database import SessionDep
from ...rbac import require_admin
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
