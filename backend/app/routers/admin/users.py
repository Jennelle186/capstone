from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from ...database import SessionDep
from ...models import User, UserRole
from ...rbac import require_admin
from ...services.activity_log import record_activity
from ...services.clerk import sync_user_role

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users")


class UserResponse(BaseModel):
    id: str
    email: str | None
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    role: str
    created_at: str | None


class UpdateRoleRequest(BaseModel):
    new_role: str


def _to_user_response(user: User) -> UserResponse:
    # Normalize a DB user row into the API response model.
    return UserResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        role=user.role.value,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@router.get("", response_model=List[UserResponse])
async def list_users(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
):
    # Return paginated users sorted by most recently created first.
    del current_user

    stmt = select(User).offset(skip).limit(limit).order_by(desc(User.created_at))
    users = (await db.execute(stmt)).scalars().all()
    return [_to_user_response(user) for user in users]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Fetch a single user by UUID-like id string.
    del current_user

    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return _to_user_response(user)


@router.post("/{user_id}/role")
async def update_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    # Validate and apply a role transition for an existing user.

    try:
        new_role = UserRole(payload.new_role)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.new_role}") from error

    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This user has no Clerk account, so their role cannot be changed.",
        )

    # Administrators are created only through the adviser promotion flow (promote_adviser),
    # which checks the adviser profile, repairs stale roles and unlocks the account.
    if new_role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators must be promoted from an adviser account on the Administrators page.",
        )

    # Clerk first: the role is re-read from the Clerk token at sign-in, so a DB-only
    # change would revert. If Clerk fails, nothing is saved.

    # Guards that match remove_admin: the change is now persisted, so it must not
    # lock every administrator out. Checked before anything is written to Clerk.
    if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
        if user.clerk_user_id == current_user.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove your own administrator access. Ask another administrator to do it.",
            )
        admin_count = (
            await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.ADMIN))
        ).scalar_one()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last administrator.",
            )

    clerk_user_id = user.clerk_user_id
    old_role = user.role.value
    try:
        await sync_user_role(clerk_user_id, new_role.value)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error

    user.role = new_role
    await record_activity(
        db,
        current_user,
        action="update",
        entity_type="user_role",
        entity_id=user.id,
        entity_label=user.email or str(user.id),
        previous_values={"role": old_role},
        new_values={"role": new_role.value},
    )
    try:
        await db.commit()
    except Exception:
        # Clerk already changed, so put it back to keep Clerk and the DB in step.
        await db.rollback()
        try:
            await sync_user_role(clerk_user_id, old_role)
        except RuntimeError:
            logger.error("Could not revert Clerk role for %s after a failed DB commit.", clerk_user_id)
        raise

    return {
        "user_id": str(user.id),
        "email": user.email,
        "old_role": old_role,
        "new_role": new_role.value,
        "message": f"Role updated from {old_role} to {new_role.value}",
    }
