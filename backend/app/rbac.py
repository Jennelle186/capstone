from __future__ import annotations

"""
Role-based access control (RBAC) helpers.

Quick notes:
- Backend enfore security. The front end is just for user experience (hiding/showing pages).
-This part checks who the user is based on the Clerk login token. This is from the Session Clerk Dashboard set up.
- If a user has no role or an unrecognized one, we treat them as a student. 
"""

import logging
from typing import Any, Callable

from fastapi import HTTPException, status

from .auth import CurrentUser
from .models import UserRole

logger = logging.getLogger(__name__)


def _looks_like_template(value: str) -> bool:
    # If Clerk doesn't evaluate a template, the claim can arrive literally like:
    # "{{user.public_metadata.role}}"
    stripped = value.strip()
    return "{{" in stripped or "}}" in stripped


def role_from_clerk_claims(claims: dict[str, Any]) -> UserRole:
    """
    Convert the Clerk session token `role` claim into our `UserRole`.

    Expected claim values are lowercase strings ("student" | "adviser" | "admin")
      { "role": "{{user.public_metadata.role}}" } is based on the Clerk session from the Dashboard
    """
    raw = claims.get("role")
    if not isinstance(raw, str):
        return UserRole.STUDENT

    value = raw.strip().lower()
    if not value or _looks_like_template(value):
        if _looks_like_template(value):
            logger.warning(
                "RBAC: role claim looks like an unevaluated Clerk template (%r); defaulting to STUDENT",
                raw,
            )
        return UserRole.STUDENT

    if value == "student":
        return UserRole.STUDENT
    if value == "adviser":
        return UserRole.ADVISER
    if value == "admin":
        return UserRole.ADMIN

    # Unknown roles are treated as lowest privilege.
    logger.warning("RBAC: unknown role claim received: %r; defaulting to STUDENT", value)
    return UserRole.STUDENT


def require_roles(*allowed: UserRole, allow_admin: bool = True) -> Callable[[CurrentUser], dict[str, Any]]:
    """
    FastAPI dependency that enforces RBAC for a route.

    Usage:
      @router.get("/api/adviser/...", dependencies=[Depends(require_roles(UserRole.ADVISER))])
      async def handler(...): ...
    """
    allowed_set: set[UserRole] = set(allowed)
    allowed_values = sorted({r.value for r in allowed_set})

    def _dependency(current_user: CurrentUser) -> dict[str, Any]:
        user_role = role_from_clerk_claims(current_user)
        # Admins can access everything.
        # pass `allow_admin=False` for strict endpoints that even admins can't access.
        if allow_admin and user_role == UserRole.ADMIN:
            return current_user
        if user_role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden. Requires role in: {allowed_values}",
            )
        return current_user

    return _dependency


# Optional convenience dependencies (usable as `Depends(require_adviser)`).
require_student = require_roles(UserRole.STUDENT, allow_admin=False)
require_adviser = require_roles(UserRole.ADVISER)
require_admin = require_roles(UserRole.ADMIN)
