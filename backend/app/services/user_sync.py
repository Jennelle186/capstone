from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Student, User, UserRole
from .clerk import fetch_user_profile

logger = logging.getLogger(__name__)


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


def _coerce_role(value: Any) -> UserRole | None:
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    if not value or _looks_like_template(value):
        return None
    if value == "student":
        return UserRole.STUDENT
    if value == "teacher":
        return UserRole.TEACHER
    if value == "admin":
        return UserRole.ADMIN
    return None


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
    #   "first_name": "{{user.first_name}}"
    # }
    token_email = _extract_email_from_claims(clerk_claims)
    token_first_name = _extract_first_name_from_claims(clerk_claims)
    token_last_name = _extract_last_name_from_claims(clerk_claims)

    # If role isn't set yet (new signups), default to STUDENT.
    token_role_value = clerk_claims.get("role")

    # If no user stored yet, create a local user row keyed by Clerk `sub`.
    #saving those email, first name, last name, and role values that we got from the token claims, but if they are missing or look like unevaluated templates, we'll fetch the real values from Clerk's API as a fallback (useful for Google/Gmail OAuth where email might not be in the token).
    if user is None:
        email = token_email
        first_name = token_first_name
        last_name = token_last_name
        role = _coerce_role(token_role_value) or UserRole.STUDENT

        # Fallback: if email isn't present in the token, fetch it from Clerk (useful for Google/Gmail OAuth).
        if not email:
            api_email, api_first_name, api_last_name, _api_metadata = await fetch_user_profile(clerk_user_id)
            email = email or _normalize_email(api_email)
            first_name = first_name or _normalize_name(api_first_name)
            last_name = last_name or _normalize_name(api_last_name)

        user = User(
            clerk_user_id=clerk_user_id,
            email=email,
            first_name=first_name,
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

        # Ensure a Student profile row exists for students (can be empty initially).
        if user.role == UserRole.STUDENT:
            result = await db.execute(select(Student).where(Student.user_id == user.id))
            student = result.scalar_one_or_none()
            if student is None:
                db.add(Student(user_id=user.id))
                try:
                    await db.commit()
                except IntegrityError:
                    await db.rollback()
        return user

    # Update fields if we learned something new.
    changed = False
    if token_email and user.email != token_email:
        user.email = token_email
        changed = True

    if token_first_name and user.first_name != token_first_name:
        user.first_name = token_first_name
        changed = True

    if token_last_name and user.last_name != token_last_name:
        user.last_name = token_last_name
        changed = True

    token_role = _coerce_role(token_role_value)
    if token_role and user.role != token_role:
        user.role = token_role
        changed = True

    # Fallback: if we still don't have a sane email/name stored (or we stored an unevaluated template earlier),
    # try fetching it from Clerk.
    user_email_ok = _normalize_email(user.email) if user.email else None
    user_first_ok = _normalize_name(user.first_name) if user.first_name else None
    user_last_ok = _normalize_name(user.last_name) if user.last_name else None
    if ((not user_email_ok) and (not token_email)) or ((not user_first_ok) and (not token_first_name)) or ((not user_last_ok) and (not token_last_name)):
        api_email, api_first_name, api_last_name, _api_metadata = await fetch_user_profile(clerk_user_id)
        api_email = _normalize_email(api_email)
        api_first_name = _normalize_name(api_first_name)
        api_last_name = _normalize_name(api_last_name)
        if api_email and not user_email_ok:
            user.email = api_email
            changed = True
        if api_first_name and not user_first_ok:
            user.first_name = api_first_name
            changed = True
        if api_last_name and not user_last_ok:
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

    # Ensure a Student profile row exists for students (can be empty initially).
    if user.role == UserRole.STUDENT:
        result = await db.execute(select(Student).where(Student.user_id == user.id))
        student = result.scalar_one_or_none()
        if student is None:
            db.add(Student(user_id=user.id))
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()

    return user
