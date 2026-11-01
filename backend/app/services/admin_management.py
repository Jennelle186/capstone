"""Admin management service: list / invite / revoke / promote / remove admins."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select

from ..database import SessionDep
from .activity_log import record_activity
from ..models import (
    AdminAuditLog,
    AdminInvitation,
    Adviser,
    AdviserInvitationStatus,
    Student,
    User,
    UserRole,
)
from ..schemas.admins import (
    AdminInvitationResponse,
    AdminInviteRequest,
    AdminResponse,
)
from .clerk import (
    create_application_invitation,
    delete_user,
    revoke_application_invitation,
    unlock_user_account,
    update_user_public_metadata,
)

logger = logging.getLogger(__name__)

DEFAULT_EXPIRES_IN_DAYS = 7


def _full_name(user: User) -> str:
    parts = [user.first_name, user.middle_name, user.last_name]
    return " ".join(part for part in parts if part).strip() or (user.email or "Administrator")


async def _actor_user_id(db: SessionDep, current_user: dict) -> UUID | None:
    sub = current_user.get("sub") if current_user else None
    if not isinstance(sub, str) or not sub:
        return None
    return (
        await db.execute(select(User.id).where(User.clerk_user_id == sub))
    ).scalar_one_or_none()


async def _log_action(
    db: SessionDep,
    action: str,
    entity_id: UUID,
    current_user: dict | None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    entity_label: str | None = None,
) -> None:
    await record_activity(
        db,
        current_user,
        action=action,
        entity_type="admin",
        entity_id=entity_id,
        entity_label=entity_label,
        previous_values=previous_values,
        new_values=new_values,
    )


def _default_redirect_url() -> str:
    configured = os.getenv("ADMIN_INVITE_REDIRECT_URL")
    if configured and configured.strip():
        return configured.strip()
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5173").strip().rstrip("/")
    return f"{frontend_url}/auth/signup"


def _to_invitation_response(invitation: AdminInvitation) -> AdminInvitationResponse:
    return AdminInvitationResponse(
        id=invitation.id,
        email=invitation.email,
        first_name=invitation.first_name,
        middle_name=invitation.middle_name,
        last_name=invitation.last_name,
        status=invitation.status.value,
        invited_by_user_id=invitation.invited_by_user_id,
        accepted_user_id=invitation.accepted_user_id,
        expires_at=invitation.expires_at,
        accepted_at=invitation.accepted_at,
        created_at=invitation.created_at,
        updated_at=invitation.updated_at,
    )


async def list_admins(db: SessionDep) -> list[AdminResponse]:
    stmt = select(User).where(User.role == UserRole.ADMIN).order_by(User.created_at)
    users = (await db.execute(stmt)).scalars().all()
    return [
        AdminResponse(
            id=user.id,
            name=_full_name(user),
            email=user.email,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
        for user in users
    ]


async def list_invitations(db: SessionDep) -> list[AdminInvitationResponse]:
    stmt = select(AdminInvitation).order_by(AdminInvitation.created_at.desc())
    invitations = (await db.execute(stmt)).scalars().all()
    return [_to_invitation_response(invitation) for invitation in invitations]


async def invite_admin(
    db: SessionDep,
    payload: AdminInviteRequest,
    current_user: dict,
) -> AdminInvitationResponse:
    email = payload.email.lower()

    existing_user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if existing_user is not None:
        detail = (
            f'Email "{payload.email}" is already an administrator.'
            if existing_user.role == UserRole.ADMIN
            else f'Email "{payload.email}" already belongs to an existing user.'
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    pending_invite = (
        await db.execute(
            select(AdminInvitation.id).where(
                func.lower(AdminInvitation.email) == email,
                AdminInvitation.status == AdviserInvitationStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if pending_invite is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Email "{payload.email}" already has a pending invitation.',
        )

    inviter_user_id = await _actor_user_id(db, current_user)
    expires_at = datetime.now(timezone.utc) + timedelta(days=DEFAULT_EXPIRES_IN_DAYS)
    invitation_metadata = {
        "role": "admin",
        "first_name": payload.first_name,
        "middle_name": payload.middle_name,
        "last_name": payload.last_name,
    }

    try:
        clerk_invitation = await create_application_invitation(
            email,
            public_metadata=invitation_metadata,
            redirect_url=_default_redirect_url(),
            notify=True,
            ignore_existing=True,
            expires_in_days=DEFAULT_EXPIRES_IN_DAYS,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    invitation = AdminInvitation(
        clerk_invitation_id=clerk_invitation["id"],
        email=email,
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        invited_by_user_id=inviter_user_id,
        status=AdviserInvitationStatus.PENDING,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    await _log_action(
        db,
        "admin_invite",
        invitation.id,
        current_user,
        new_values={"email": email},
        entity_label=email,
    )
    await db.commit()

    return _to_invitation_response(invitation)


async def revoke_invitation(
    db: SessionDep,
    invitation_id: UUID,
    current_user: dict | None = None,
) -> AdminInvitationResponse:
    invitation = await db.get(AdminInvitation, invitation_id)
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found.")

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
    await record_activity(
        db,
        current_user,
        action="revoke",
        entity_type="admin",
        entity_id=invitation.id,
        entity_label=invitation.email,
        previous_values={"status": AdviserInvitationStatus.PENDING.value},
        new_values={"status": AdviserInvitationStatus.REVOKED.value},
    )
    await db.commit()
    await db.refresh(invitation)
    return _to_invitation_response(invitation)


async def promote_adviser(
    db: SessionDep,
    adviser_id: UUID,
    current_user: dict,
) -> AdminResponse:
    adviser = await db.get(Adviser, adviser_id)
    if adviser is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adviser not found.")

    user = await db.get(User, adviser.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already an administrator.",
        )

    previous_role = user.role.value

    # Repair a stale role (e.g. a legacy admin-removal left role="student" while the
    # adviser profile persisted). The adviser profile is authoritative: restore the
    # account to an active adviser before promoting.
    if user.role != UserRole.ADVISER:
        user.role = UserRole.ADVISER
        # Drop any stale student profile created while the role was "student".
        await db.execute(delete(Student).where(Student.user_id == user.id))
        if user.clerk_user_id:
            try:
                await unlock_user_account(user.clerk_user_id)
            except RuntimeError:
                logger.warning(
                    "Failed to unlock Clerk account during promote repair for clerk_user_id=%s",
                    user.clerk_user_id,
                )
            await update_user_public_metadata(user.clerk_user_id, {"role": UserRole.ADVISER.value})

    user.role = UserRole.ADMIN
    await db.commit()
    await db.refresh(user)

    if user.clerk_user_id:
        await update_user_public_metadata(user.clerk_user_id, {"role": UserRole.ADMIN.value})

    await _log_action(
        db,
        "admin_promote",
        user.id,
        current_user,
        previous_values={"role": previous_role},
        new_values={"role": UserRole.ADMIN.value},
        entity_label=_full_name(user),
    )
    await db.commit()

    return AdminResponse(
        id=user.id,
        name=_full_name(user),
        email=user.email,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def remove_admin(db: SessionDep, admin_id: UUID, current_user: dict) -> None:
    user = await db.get(User, admin_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Administrator not found.")
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an administrator.",
        )

    actor_user_id = await _actor_user_id(db, current_user)
    if actor_user_id is not None and actor_user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself. Ask another administrator to do it.",
        )

    admin_count = (
        await db.execute(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN)
        )
    ).scalar_one()
    if admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last administrator.",
        )

    adviser = (
        await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    ).scalar_one_or_none()

    if adviser is not None:
        # Promoted from an adviser → restore their adviser role.
        user.role = UserRole.ADVISER
        await db.commit()
        await db.refresh(user)

        if user.clerk_user_id:
            await update_user_public_metadata(user.clerk_user_id, {"role": UserRole.ADVISER.value})

        await _log_action(
            db,
            "admin_remove",
            user.id,
            current_user,
            previous_values={"role": UserRole.ADMIN.value},
            new_values={"role": UserRole.ADVISER.value, "email": user.email},
            entity_label=_full_name(user),
        )
        await db.commit()
        return

    # Directly-invited administrator (never an adviser) → remove from the system.
    clerk_user_id = user.clerk_user_id
    await _log_action(
        db,
        "admin_remove",
        user.id,
        current_user,
        previous_values={"role": UserRole.ADMIN.value},
        # The email is stored because the account is deleted; the history needs it to find this person later.
        new_values={"removed_from_system": True, "email": user.email},
        entity_label=_full_name(user),
    )
    await db.delete(user)
    await db.commit()

    if clerk_user_id:
        await delete_user(clerk_user_id)
