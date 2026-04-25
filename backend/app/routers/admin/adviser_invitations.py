from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from ...database import SessionDep
from ...models import (
    AdviserInvitation,
    AdviserInvitationStatus,
    Department,
    SchoolYear,
    SchoolYearStatus,
    User,
)
from ...rbac import require_admin
from ...services.clerk import create_application_invitation, revoke_application_invitation

# Dedicated namespace for pre-account adviser invitation lifecycle.
router = APIRouter(prefix="/advisers/invitations")


class CreateAdviserInvitationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    department_code: str = Field(min_length=1, max_length=30)
    school_year_name: str = Field(min_length=4, max_length=64)
    redirect_url: str | None = Field(default=None, max_length=512)
    expires_in_days: int = Field(default=7, ge=1, le=30)
    notify: bool = True
    ignore_existing: bool = True

    # Normalize required text inputs and reject whitespace-only strings.
    @field_validator("first_name", "last_name", "department_code", "school_year_name")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field is required.")
        return normalized

    @field_validator("middle_name")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("Email is required.")
        return normalized

    @field_validator("department_code")
    @classmethod
    def normalize_department_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("redirect_url")
    @classmethod
    def normalize_redirect_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

# Response model includes all invitation fields for consistency across endpoints, 
# even if some are null depending on the stage of the lifecycle.
class AdviserInvitationResponse(BaseModel):
    id: str
    clerk_invitation_id: str
    email: str
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    department_code: str | None
    school_year_name: str | None
    status: str
    invited_by_user_id: str | None
    accepted_user_id: str | None
    accepted_adviser_id: str | None
    expires_at: datetime | None
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdviserInvitationCreateResponse(AdviserInvitationResponse):
    invitation_url: str | None = None

# Helper functions for consistent behavior and response shaping across endpoints.
def _build_default_invite_redirect_url() -> str:
    """
    Build a safe fallback redirect URL if the client does not provide one.
    """
    configured = os.getenv("ADVISER_INVITE_REDIRECT_URL")
    if configured and configured.strip():
        return configured.strip()

    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5173").strip().rstrip("/")
    return f"{frontend_url}/auth/signup"

# Coerce Clerk invitation statuses into our internal enum, 
# treating unknown values as pending to allow for future-proofing.
def _coerce_status(value: str | AdviserInvitationStatus) -> AdviserInvitationStatus:
    """
    Convert free-form status text into our enum; unknown values fall back to pending.
    """
    if isinstance(value, AdviserInvitationStatus):
        return value
    normalized = value.strip().lower()
    if normalized == AdviserInvitationStatus.ACCEPTED.value:
        return AdviserInvitationStatus.ACCEPTED
    if normalized == AdviserInvitationStatus.REVOKED.value:
        return AdviserInvitationStatus.REVOKED
    if normalized == AdviserInvitationStatus.EXPIRED.value:
        return AdviserInvitationStatus.EXPIRED
    return AdviserInvitationStatus.PENDING

# Centralize response shaping to ensure all endpoints return consistent fields and formatting.
def _to_response_model(
    invitation: AdviserInvitation,
    school_year_name: str | None,
) -> AdviserInvitationResponse:
    # Keep response shaping in one place so every endpoint returns consistent fields.
    return AdviserInvitationResponse(
        id=str(invitation.id),
        clerk_invitation_id=invitation.clerk_invitation_id,
        email=invitation.email,
        first_name=invitation.first_name,
        middle_name=invitation.middle_name,
        last_name=invitation.last_name,
        department_code=invitation.department_code,
        school_year_name=school_year_name,
        status=invitation.status.value,
        invited_by_user_id=str(invitation.invited_by_user_id) if invitation.invited_by_user_id else None,
        accepted_user_id=str(invitation.accepted_user_id) if invitation.accepted_user_id else None,
        accepted_adviser_id=str(invitation.accepted_adviser_id) if invitation.accepted_adviser_id else None,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        created_at=invitation.created_at,
        updated_at=invitation.updated_at,
    )

# Admin-only endpoints for managing adviser invitations, including listing with optional filters, 
# creating new invitations with validation, and revoking pending invitations.
@router.get("", response_model=list[AdviserInvitationResponse])
async def list_adviser_invitations(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
    status_filter: AdviserInvitationStatus | None = Query(default=None, alias="status"),
    email: str | None = Query(default=None),
):
    del current_user

    # Fetch invitations with school year names for admin dashboards.
    stmt = (
        select(AdviserInvitation, SchoolYear.name)
        .outerjoin(SchoolYear, AdviserInvitation.school_year_id == SchoolYear.id)
        .order_by(desc(AdviserInvitation.created_at))
    )
    if status_filter is not None:
        stmt = stmt.where(AdviserInvitation.status == status_filter)
    if email and email.strip():
        stmt = stmt.where(func.lower(AdviserInvitation.email) == email.strip().lower())

    rows = (await db.execute(stmt)).all()
    return [_to_response_model(invitation, school_year_name) for invitation, school_year_name in rows]

# Creating an invitation involves multiple validation steps to ensure data integrity and a smooth user experience,
# including checks on the target school year, department, existing users, and pending invitations.
@router.post("", response_model=AdviserInvitationCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_adviser_invitation(
    payload: CreateAdviserInvitationRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Validate the target school year before sending an email invite.
    school_year_stmt = select(SchoolYear).where(func.lower(SchoolYear.name) == payload.school_year_name.lower())
    school_year = (await db.execute(school_year_stmt)).scalar_one_or_none()
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send adviser invitations for a closed school year.",
        )

    # Department must exist and be active because assignment metadata depends on it.
    department_stmt = select(Department).where(func.lower(Department.code) == payload.department_code.lower())
    department = (await db.execute(department_stmt)).scalar_one_or_none()
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Department code "{payload.department_code}" does not exist.',
        )
    if not department.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Department code "{payload.department_code}" is inactive.',
        )

    # If a user already exists with this email, avoid creating duplicate adviser onboarding records.
    existing_user_stmt = select(User).where(func.lower(User.email) == payload.email.lower())
    existing_user = (await db.execute(existing_user_stmt)).scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Email "{payload.email}" already belongs to an existing user.',
        )

    # Prevent duplicate pending invites for the same email while still allowing resend after revoke/expire.
    pending_invite_stmt = select(AdviserInvitation.id).where(
        func.lower(AdviserInvitation.email) == payload.email.lower(),
        AdviserInvitation.status == AdviserInvitationStatus.PENDING,
    )
    pending_invite_id = (await db.execute(pending_invite_stmt)).scalar_one_or_none()
    if pending_invite_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Email "{payload.email}" already has a pending invitation.',
        )

    inviter_user_id: UUID | None = None
    inviter_clerk_user_id = current_user.get("sub")
    if isinstance(inviter_clerk_user_id, str) and inviter_clerk_user_id:
        inviter_stmt = select(User.id).where(User.clerk_user_id == inviter_clerk_user_id)
        inviter_user_id = (await db.execute(inviter_stmt)).scalar_one_or_none()

    redirect_url = payload.redirect_url or _build_default_invite_redirect_url()
    expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    # Include role + assignment metadata so post-acceptance provisioning can hydrate records deterministically.
    invitation_metadata = {
        "role": "adviser",
        "first_name": payload.first_name,
        "middle_name": payload.middle_name,
        "last_name": payload.last_name,
        "department_code": department.code,
        "school_year_name": school_year.name,
    }
    try:
        clerk_invitation = await create_application_invitation(
            payload.email,
            public_metadata=invitation_metadata,
            redirect_url=redirect_url,
            notify=payload.notify,
            ignore_existing=payload.ignore_existing,
            expires_in_days=payload.expires_in_days,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    invitation = AdviserInvitation(
        clerk_invitation_id=clerk_invitation["id"],
        email=payload.email,
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        department_code=department.code,
        school_year_id=school_year.id,
        invited_by_user_id=inviter_user_id,
        status=_coerce_status(clerk_invitation["status"]),
        expires_at=expires_at,
    )
    db.add(invitation)

    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invitation with the same Clerk id already exists.",
        ) from error

    await db.refresh(invitation)
    response_payload = _to_response_model(invitation, school_year.name).model_dump()
    response_payload["invitation_url"] = clerk_invitation.get("url")
    return AdviserInvitationCreateResponse(**response_payload)


# Admin-only endpoint to revoke a pending adviser invitation, 
# which also revokes the underlying Clerk invitation.
@router.post("/{invitation_id}/revoke", response_model=AdviserInvitationResponse)
async def revoke_adviser_invitation(
    invitation_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = (
        select(AdviserInvitation, SchoolYear.name)
        .outerjoin(SchoolYear, AdviserInvitation.school_year_id == SchoolYear.id)
        .where(AdviserInvitation.id == invitation_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

    invitation, school_year_name = row
    if invitation.status != AdviserInvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Only pending invitations can be revoked (current status: "{invitation.status.value}").',
        )

    try:
        await revoke_application_invitation(invitation.clerk_invitation_id)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    invitation.status = AdviserInvitationStatus.REVOKED
    await db.commit()
    await db.refresh(invitation)

    return _to_response_model(invitation, school_year_name)
