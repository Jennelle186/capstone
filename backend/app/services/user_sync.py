from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Adviser,
    AdviserInvitation,
    AdviserInvitationStatus,
    Program,
    ProgramAdviserAssignment,
    Student,
    User,
    UserRole,
)
from .clerk import fetch_user_profile, update_user_personal_names

logger = logging.getLogger(__name__)

# Must match the namespace used by admin program assignment logic so the mapping is deterministic.
PROGRAM_UUID_NAMESPACE = uuid.UUID("e40ec4af-aa57-47e2-9169-cc4f1f6d03ff")

# This module ensures that the authenticated Clerk user has a corresponding User row in our database,
# and keeps profile fields (email, name) in sync on every authenticated request.
# It also enforces role-based side effects like creating a Student profile for new users with the student role,
# and promoting users with pending adviser invitations to advisers.
def _looks_like_template(value: str) -> bool:
    stripped = value.strip()
    # If Clerk doesn't evaluate a template, the claim can arrive literally like:
    # "{{user.primary_email_address.email_address}}"
    return "{{" in stripped or "}}" in stripped


def _normalize_email(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or _looks_like_template(value):
        return None
    # Minimal check to avoid storing junk.
    if "@" not in value:
        return None
    return value


def _normalize_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or _looks_like_template(value):
        return None
    return value


def _extract_email_from_claims(claims: dict[str, Any]) -> str | None:
    """
    Extract email from Clerk session token custom claims.
    Custom claim from Clerk Dashboard -> Sessions -> Customize session token:
        { "email": "{{user.primary_email_address.email_address}}" }
    """
    return _normalize_email(claims.get("email"))


def _extract_first_name_from_claims(claims: dict[str, Any]) -> str | None:
    return _normalize_name(claims.get("first_name"))


def _extract_last_name_from_claims(claims: dict[str, Any]) -> str | None:
    return _normalize_name(claims.get("last_name"))


def _extract_middle_name_from_claims(claims: dict[str, Any]) -> str | None:
    return _normalize_name(claims.get("middle_name"))


def _coerce_role(value: Any) -> UserRole | None:
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    if not value or _looks_like_template(value):
        return None
    if value == "student":
        return UserRole.STUDENT
    if value == "adviser":
        return UserRole.ADVISER
    if value == "admin":
        return UserRole.ADMIN
    return None


def _program_uuid_for_department_code(department_code: str) -> uuid.UUID:
    """
    Keep department->program mapping stable across the app and migrations.
    """
    return uuid.uuid5(PROGRAM_UUID_NAMESPACE, department_code.strip().upper())


async def _ensure_student_profile(db: AsyncSession, user: User) -> None:
    """
    Ensure a student profile exists for users with student role.
    """
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is not None:
        return

    db.add(Student(user_id=user.id))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()


async def _promote_and_finalize_adviser_invitation(db: AsyncSession, user: User) -> None:
    """
    When a signed-in user matches a pending adviser invitation, promote/finalize them:
    - enforce adviser role
    - ensure adviser profile exists
    - create/update assignment for invitation school year + department
    - mark invitation as accepted
    """
    # If token claims missed email on the first pass, try Clerk API once more before giving up.
    if not user.email:
        api_email, _api_first_name, _api_middle_name, _api_last_name, _api_metadata = await fetch_user_profile(user.clerk_user_id)
        normalized_api_email = _normalize_email(api_email)
        if normalized_api_email:
            user.email = normalized_api_email
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
        if not user.email:
            return

    invite_stmt = (
        select(AdviserInvitation)
        .where(
            func.lower(AdviserInvitation.email) == user.email.lower(),
            AdviserInvitation.status == AdviserInvitationStatus.PENDING,
        )
        .order_by(desc(AdviserInvitation.created_at))
    )
    invitation = (await db.execute(invite_stmt)).scalars().first()
    if invitation is None:
        return

    changed = False
    if user.role != UserRole.ADVISER:
        user.role = UserRole.ADVISER
        changed = True

    # Fill missing local profile names from the original invite snapshot.
    if (not user.first_name) and invitation.first_name:
        user.first_name = invitation.first_name
        changed = True
    if (not user.middle_name) and invitation.middle_name:
        user.middle_name = invitation.middle_name
        changed = True
    if (not user.last_name) and invitation.last_name:
        user.last_name = invitation.last_name
        changed = True

    # Keep Clerk personal name fields aligned with invitation-provided names.
    if invitation.first_name or invitation.last_name:
        updated_names = await update_user_personal_names(
            user.clerk_user_id,
            first_name=invitation.first_name,
            last_name=invitation.last_name,
        )
        if updated_names is None:
            logger.warning(
                "Failed to sync Clerk personal names for invited adviser clerk_user_id=%s",
                user.clerk_user_id,
            )

    adviser_result = await db.execute(select(Adviser).where(Adviser.user_id == user.id))
    adviser = adviser_result.scalar_one_or_none()
    if adviser is None:
        adviser = Adviser(user_id=user.id)
        db.add(adviser)
        await db.flush()
        changed = True

    # Persist assignment only when invitation carries both pieces of assignment metadata.
    if invitation.department_code and invitation.school_year_id:
        program_id = _program_uuid_for_department_code(invitation.department_code)
        program = await db.get(Program, program_id)
        if program is None:
            db.add(Program(id=program_id))
            await db.flush()
            changed = True

        assignment_stmt = (
            select(ProgramAdviserAssignment)
            .where(
                ProgramAdviserAssignment.adviser_id == adviser.id,
                ProgramAdviserAssignment.school_year_id == invitation.school_year_id,
            )
            .order_by(
                desc(ProgramAdviserAssignment.updated_at),
                desc(ProgramAdviserAssignment.created_at),
            )
        )
        assignments = (await db.execute(assignment_stmt)).scalars().all()
        if assignments:
            latest_assignment = assignments[0]
            if latest_assignment.program_id != program_id:
                latest_assignment.program_id = program_id
                changed = True
            for stale_assignment in assignments[1:]:
                await db.delete(stale_assignment)
                changed = True
        else:
            db.add(
                ProgramAdviserAssignment(
                    adviser_id=adviser.id,
                    program_id=program_id,
                    school_year_id=invitation.school_year_id,
                )
            )
            changed = True

    invitation.status = AdviserInvitationStatus.ACCEPTED
    invitation.accepted_user_id = user.id
    invitation.accepted_adviser_id = adviser.id
    invitation.accepted_at = datetime.now(timezone.utc)
    changed = True

    if changed:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
        else:
            await db.refresh(user)


async def ensure_user_row(db: AsyncSession, clerk_claims: dict[str, Any]) -> User:
    """
   Ensures the authenticated Clerk user exists in the db
    """
    clerk_user_id = clerk_claims.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id:
        raise ValueError("Missing Clerk user id (JWT `sub`) in claims")

    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()

    # Custom claims from the Clerk Dashboard -> Sessions -> Customize session token:
    # {
    #   "role": "{{user.public_metadata.role}}",
    #   "email": "{{user.primary_email_address.email_address}}",
    #   "last_name": "{{user.last_name}}",
    #   "first_name": "{{user.first_name}}",
    #   "middle_name": "{{user.public_metadata.middle_name}}"
    # }
    token_email = _extract_email_from_claims(clerk_claims)
    token_first_name = _extract_first_name_from_claims(clerk_claims)
    token_last_name = _extract_last_name_from_claims(clerk_claims)
    token_middle_name = _extract_middle_name_from_claims(clerk_claims)

    # If role isn't set yet (new signups), default to STUDENT.
    token_role_value = clerk_claims.get("role")

    # If no user stored yet, create a local user row keyed by Clerk `sub`.
    #saving those email, first name, last name, and role values that we got from the token claims, but if they are missing or look like unevaluated templates, we'll fetch the real values from Clerk's API as a fallback (useful for Google/Gmail OAuth where email might not be in the token).
    if user is None:
        email = token_email
        first_name = token_first_name
        last_name = token_last_name
        middle_name = token_middle_name
        role = _coerce_role(token_role_value) or UserRole.STUDENT

        # Fallback: if token claims are incomplete, fetch profile values from Clerk.
        if (not email) or (not first_name) or (not middle_name) or (not last_name):
            api_email, api_first_name, api_middle_name, api_last_name, _api_metadata = await fetch_user_profile(clerk_user_id)
            email = email or _normalize_email(api_email)
            first_name = first_name or _normalize_name(api_first_name)
            middle_name = middle_name or _normalize_name(api_middle_name)
            last_name = last_name or _normalize_name(api_last_name)

        user = User(
            clerk_user_id=clerk_user_id,
            email=email,
            first_name=first_name,
            middle_name=middle_name,
            last_name=last_name,
            role=role,
        )
        db.add(user)
        try:
            await db.commit()
        except IntegrityError:
            # Another request may have created it concurrently; re-fetch.
            await db.rollback()
            result = await db.execute(
                select(User).where(User.clerk_user_id == clerk_user_id)
            )
            user = result.scalar_one()
        except Exception:
            await db.rollback()
            logger.exception("Failed to create user row for clerk_user_id=%s", clerk_user_id)
            raise
        else:
            await db.refresh(user)

        # Finalize role-specific side effects for first-time sign-ins.
        await _promote_and_finalize_adviser_invitation(db, user)
        if user.role == UserRole.STUDENT:
            await _ensure_student_profile(db, user)
        return user

    # Update fields if we learned something new.
    changed = False
    if token_email and user.email != token_email:
        user.email = token_email
        changed = True

    if token_first_name and user.first_name != token_first_name:
        user.first_name = token_first_name
        changed = True

    if token_middle_name and user.middle_name != token_middle_name:
        user.middle_name = token_middle_name
        changed = True

    if token_last_name and user.last_name != token_last_name:
        user.last_name = token_last_name
        changed = True

    token_role = _coerce_role(token_role_value)
    if token_role and user.role != token_role:
        user.role = token_role
        changed = True

    # Fallback/sync:
    # - If token claims are missing required profile fields, fetch Clerk profile.
    # - If claims for names are not present, use Clerk profile as reconciliation source so
    #   edits made in Clerk UI can propagate back to our DB.
    user_email_ok = _normalize_email(user.email) if user.email else None
    user_first_ok = _normalize_name(user.first_name) if user.first_name else None
    user_middle_ok = _normalize_name(user.middle_name) if user.middle_name else None
    user_last_ok = _normalize_name(user.last_name) if user.last_name else None
    should_sync_from_clerk_api = (
        ((not user_email_ok) and (not token_email))
        or ((not user_first_ok) and (not token_first_name))
        or ((not user_middle_ok) and (not token_middle_name))
        or ((not user_last_ok) and (not token_last_name))
    )
    if (not should_sync_from_clerk_api) and (
        token_first_name is None and token_middle_name is None and token_last_name is None
    ):
        should_sync_from_clerk_api = True

    if should_sync_from_clerk_api:
        api_email, api_first_name, api_middle_name, api_last_name, _api_metadata = await fetch_user_profile(clerk_user_id)
        api_email = _normalize_email(api_email)
        api_first_name = _normalize_name(api_first_name)
        api_middle_name = _normalize_name(api_middle_name)
        api_last_name = _normalize_name(api_last_name)
        profile_fetch_succeeded = any(
            value is not None for value in (api_email, api_first_name, api_middle_name, api_last_name, _api_metadata)
        )
        if profile_fetch_succeeded and token_email is None and user_email_ok != api_email:
            user.email = api_email
            changed = True
        if profile_fetch_succeeded and token_first_name is None and user_first_ok != api_first_name:
            user.first_name = api_first_name
            changed = True
        if profile_fetch_succeeded and token_middle_name is None and user_middle_ok != api_middle_name:
            user.middle_name = api_middle_name
            changed = True
        if profile_fetch_succeeded and token_last_name is None and user_last_ok != api_last_name:
            user.last_name = api_last_name
            changed = True

    if changed:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
        except Exception:
            await db.rollback()
            logger.exception("Failed to update user row for clerk_user_id=%s", clerk_user_id)
            raise
        else:
            await db.refresh(user)

    # Keep role-specific local profile rows in sync on every authenticated call.
    await _promote_and_finalize_adviser_invitation(db, user)
    if user.role == UserRole.STUDENT:
        await _ensure_student_profile(db, user)

    return user
