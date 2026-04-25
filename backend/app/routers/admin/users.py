from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select

from ...database import SessionDep
from ...models import User, UserRole
from ...rbac import require_admin

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
    del current_user

    try:
        new_role = UserRole(payload.new_role)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid role: {payload.new_role}") from error

    stmt = select(User).where(User.id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.role.value
    user.role = new_role
    await db.commit()

    return {
        "user_id": str(user.id),
        "email": user.email,
        "old_role": old_role,
        "new_role": new_role.value,
        "message": f"Role updated from {old_role} to {new_role.value}",
    }
