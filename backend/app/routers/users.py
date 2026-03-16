from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy import select
from typing_extensions import Annotated

from ..database import SessionDep
from ..models import Student, User, UserRole
from ..rbac import require_student
from ..services.clerk import update_user_public_metadata
from ..services.user_sync import ensure_user_row

router = APIRouter()


class PublicMetadataUpdate(BaseModel):
    # These fields are stored in Clerk `publicMetadata` and optionally added to the session token as custom claims.
    student_number: str | None = None
    program: str | None = None


# Strict student-only endpoint: admins should not be able to modify student profile fields.
StudentClaims = Annotated[dict, Depends(require_student)]


@router.post("/api/users/public-metadata", tags=["users"])
async def update_public_metadata(payload: PublicMetadataUpdate, current_user: StudentClaims, db: SessionDep) -> dict:
    """
    Stores app-specific data in Clerk publicMetadata, then mirrors it into the DB.

    Security:
    NEED TO SET ROLES FIRST IN THE CLERK DASHBOARD OR VIA ADMIN-ONLY BACKEND FLOW.
    
    """
    clerk_user_id = current_user.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise HTTPException(status_code=400, detail="Missing Clerk user id (sub).")

    public_metadata_update: dict[str, Any] = {}
    if payload.student_number is not None:
        public_metadata_update["student_number"] = payload.student_number
    if payload.program is not None:
        public_metadata_update["program"] = payload.program

    updated_public_metadata = await update_user_public_metadata(clerk_user_id, public_metadata_update)
    if updated_public_metadata is None:
        raise HTTPException(status_code=502, detail="Failed to update Clerk publicMetadata.")

    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        # Create the local user row now that Clerk has the publicMetadata.
        user = await ensure_user_row(db, current_user)

    user.public_metadata = updated_public_metadata

    # If the user is a student, keep a 1:1 Student profile row in sync.
    if user.role == UserRole.STUDENT:
        student_number = updated_public_metadata.get("student_number")
        program = updated_public_metadata.get("program")
        result = await db.execute(select(Student).where(Student.user_id == user.id))
        student = result.scalar_one_or_none()
        if student is None:
            student = Student(user_id=user.id)
            db.add(student)

        if isinstance(student_number, str) and student_number:
            student.student_number = student_number
        if isinstance(program, str) and program:
            student.program = program

    await db.commit()
    await db.refresh(user)

    return {
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "role": user.role.value,
        "public_metadata": user.public_metadata,
    }
