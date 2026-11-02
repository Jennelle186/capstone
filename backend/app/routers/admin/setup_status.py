from __future__ import annotations

from fastapi import APIRouter, Depends

from ...database import SessionDep
from ...rbac import require_admin
from ...schemas.admin_setup_status import AdminSetupStatusResponse
from ...services.admin_setup_status import get_setup_status

router = APIRouter(prefix="/setup-status")


@router.get("", response_model=AdminSetupStatusResponse)
async def read_setup_status(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> AdminSetupStatusResponse:
    """Read-only checklist status for the admin setup guide."""
    del current_user
    return await get_setup_status(db)
