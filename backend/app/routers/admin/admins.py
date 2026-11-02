"""Admin management endpoints (list / invite / revoke / promote / remove admins)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status

from ...database import SessionDep
from ...rbac import require_admin
from ...schemas.admin_history import AdminHistoryPerson
from ...schemas.admins import (
    AdminInvitationResponse,
    AdminInviteRequest,
    AdminResponse,
    PromoteRequest,
)
from ...services.admin_history import get_admin_history
from ...services.admin_management import (
    invite_admin,
    list_admins,
    list_invitations,
    promote_adviser,
    remove_admin,
    revoke_invitation,
)

router = APIRouter(prefix="/admins")


@router.get("", response_model=list[AdminResponse])
async def get_admins(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> list[AdminResponse]:
    """List all administrators."""
    del current_user
    return await list_admins(db)


@router.post("/invite", response_model=AdminInvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_invitation(
    payload: AdminInviteRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> AdminInvitationResponse:
    """Invite a new administrator by email (Clerk invitation)."""
    return await invite_admin(db, payload, current_user)


@router.get("/history", response_model=list[AdminHistoryPerson])
async def get_administrator_history(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> list[AdminHistoryPerson]:
    """Timeline of every person who was invited, promoted, revoked or removed as an administrator."""
    del current_user
    return await get_admin_history(db)


@router.get("/invitations", response_model=list[AdminInvitationResponse])
async def get_admin_invitations(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> list[AdminInvitationResponse]:
    """List admin invitations."""
    del current_user
    return await list_invitations(db)


@router.post("/invitations/{invitation_id}/revoke", response_model=AdminInvitationResponse)
async def revoke_admin_invitation(
    invitation_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> AdminInvitationResponse:
    """Revoke a pending admin invitation."""
    return await revoke_invitation(db, invitation_id, current_user)


@router.post("/promote", response_model=AdminResponse)
async def promote_adviser_to_admin(
    payload: PromoteRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> AdminResponse:
    """Promote an existing adviser to administrator."""
    return await promote_adviser(db, payload.adviser_id, current_user)


@router.delete("/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin(
    admin_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> None:
    """Remove (demote) an administrator."""
    await remove_admin(db, admin_id, current_user)
