from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..auth import CurrentUser
from ..database import SessionDep
from ..models import Student, User

router = APIRouter()


def _debug_enabled() -> bool:
    return os.getenv("DEBUG_CLAIMS", "").lower() in {"1", "true", "yes"}


@router.get("/api/debug/claims", tags=["debug"])
async def debug_claims(current_user: CurrentUser) -> dict:
    """
    Dev-only endpoint to inspect what claims the backend sees after Clerk verification.
    """
    if not _debug_enabled():
        raise HTTPException(status_code=404, detail="Not found")

    # Return only the claims that were needed for our app
    return {
        "role": current_user.get("role"),
        "email": current_user.get("email"),
        "last_name": current_user.get("last_name"),
        "first_name": current_user.get("first_name"),
        "middle_name": current_user.get("middle_name"),
    }


@router.get("/api/debug/db-user", tags=["debug"])
async def debug_db_user(current_user: CurrentUser, db: SessionDep) -> dict:
    """
    Dev-only endpoint to inspect the DB row tied to the current Clerk user id.
    """
    if not _debug_enabled():
        raise HTTPException(status_code=404, detail="Not found")

    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(status_code=400, detail="Missing Clerk user id (sub).")

    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return {"exists": False}

    student = None
    if user.student:
        # relationship may be lazy depending on session state; querying for safety 
        result = await db.execute(select(Student).where(Student.user_id == user.id))
        student = result.scalar_one_or_none()

    return {
        "exists": True,
        "user": {
            "id": str(user.id),
            "clerk_user_id": user.clerk_user_id,
            "email": user.email,
            "first_name": user.first_name,
            "middle_name": user.middle_name,
            "last_name": user.last_name,
            "role": getattr(user.role, "value", user.role),
            "public_metadata": user.public_metadata,
        },
        "student": (
            None
            if student is None
            else {"student_number": student.student_number, "program": student.program}
        ),
    }
