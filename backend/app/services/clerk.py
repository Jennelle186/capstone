from __future__ import annotations

import logging
import os
from typing import Any

from clerk_backend_api.sdk import Clerk

logger = logging.getLogger(__name__)


def _normalize_non_empty_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _get_clerk_client() -> Clerk | None:
    secret_key = os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        logger.warning("Missing CLERK_SECRET_KEY; Clerk API calls disabled")
        return None

    # Keep API calls from hanging the whole request if Clerk is unreachable.
    timeout_ms = int(os.getenv("CLERK_API_TIMEOUT_MS", "2500"))
    return Clerk(bearer_auth=secret_key, timeout_ms=timeout_ms)


async def fetch_user_profile(
    clerk_user_id: str,
) -> tuple[str | None, str | None, str | None, str | None, dict[str, Any] | None]:
    """
    Fetch email, first_name, middle_name, last_name, and public_metadata from Clerk for the given user id.
    """
    client = _get_clerk_client()
    if client is None:
        return None, None, None, None, None

    try:
        user = await client.users.get_async(user_id=clerk_user_id)
    except Exception:
        logger.exception("Failed to fetch Clerk user for %s", clerk_user_id)
        return None, None, None, None, None

    # Email: prefer primary email.
    email = None
    primary_id = getattr(user, "primary_email_address_id", None)
    email_addresses = getattr(user, "email_addresses", None) or []
    if primary_id:
        for addr in email_addresses:
            if getattr(addr, "id", None) == primary_id:
                email = getattr(addr, "email_address", None)
                break
    if not email and email_addresses:
        email = getattr(email_addresses[0], "email_address", None)
    if not isinstance(email, str) or not email:
        email = None

    first_name = getattr(user, "first_name", None)
    if not isinstance(first_name, str) or not first_name.strip():
        first_name = None
    else:
        first_name = first_name.strip()

    last_name = getattr(user, "last_name", None)
    if not isinstance(last_name, str) or not last_name.strip():
        last_name = None
    else:
        last_name = last_name.strip()

    public_metadata = getattr(user, "public_metadata", None)
    if not isinstance(public_metadata, dict):
        public_metadata = None

    middle_name = getattr(user, "middle_name", None)
    if not isinstance(middle_name, str) or not middle_name.strip():
        middle_name = None
    else:
        middle_name = middle_name.strip()

    # Clerk does not always expose middle_name as a top-level attribute.
    if middle_name is None and public_metadata is not None:
        middle = public_metadata.get("middle_name")
        if isinstance(middle, str) and middle.strip():
            middle_name = middle.strip()

    return email, first_name, middle_name, last_name, public_metadata


async def update_user_public_metadata(clerk_user_id: str, public_metadata: dict[str, Any]) -> dict[str, Any] | None:
    """
    Update Clerk publicMetadata for the user and return the server's public_metadata.
    """
    client = _get_clerk_client()
    if client is None:
        return None

    try:
        user = await client.users.update_metadata_async(
            user_id=clerk_user_id,
            public_metadata=public_metadata,
        )
    except Exception:
        logger.exception("Failed to update Clerk publicMetadata for %s", clerk_user_id)
        return None

    updated = getattr(user, "public_metadata", None)
    return updated if isinstance(updated, dict) else None


async def update_user_personal_names(
    clerk_user_id: str,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
) -> tuple[str | None, str | None] | None:
    """
    Update Clerk personal first_name/last_name and return the stored values.
    """
    normalized_first_name = _normalize_non_empty_string(first_name)
    normalized_last_name = _normalize_non_empty_string(last_name)
    if normalized_first_name is None and normalized_last_name is None:
        return None

    client = _get_clerk_client()
    if client is None:
        return None

    request: dict[str, Any] = {"user_id": clerk_user_id}
    if normalized_first_name is not None:
        request["first_name"] = normalized_first_name
    if normalized_last_name is not None:
        request["last_name"] = normalized_last_name

    try:
        user = await client.users.update_async(**request)
    except Exception:
        logger.exception("Failed to update Clerk personal names for %s", clerk_user_id)
        return None

    updated_first = _normalize_non_empty_string(getattr(user, "first_name", None))
    updated_last = _normalize_non_empty_string(getattr(user, "last_name", None))
    return updated_first, updated_last


async def fetch_user_lock_status(clerk_user_id: str) -> bool | None:
    """
    Return Clerk lock state for a user.
    True means locked (cannot sign in), False means unlocked, None means unknown/error.
    """
    client = _get_clerk_client()
    if client is None:
        return None

    try:
        user = await client.users.get_async(user_id=clerk_user_id)
    except Exception:
        logger.exception("Failed to fetch Clerk lock state for %s", clerk_user_id)
        return None

    locked = getattr(user, "locked", None)
    return bool(locked) if isinstance(locked, bool) else None


async def lock_user_account(clerk_user_id: str) -> bool:
    """
    Lock a Clerk user so they cannot sign in.
    Returns True if locked, raises on failure.
    """
    client = _get_clerk_client()
    if client is None:
        raise RuntimeError("Missing CLERK_SECRET_KEY; cannot lock users.")

    try:
        user = await client.users.lock_async(user_id=clerk_user_id)
    except Exception as error:
        logger.exception("Failed to lock Clerk user %s", clerk_user_id)
        raise RuntimeError("Failed to lock Clerk user.") from error

    locked = getattr(user, "locked", None)
    return bool(locked) if isinstance(locked, bool) else True


async def unlock_user_account(clerk_user_id: str) -> bool:
    """
    Unlock a Clerk user so they can sign in again.
    Returns False if unlocked, raises on failure.
    """
    client = _get_clerk_client()
    if client is None:
        raise RuntimeError("Missing CLERK_SECRET_KEY; cannot unlock users.")

    try:
        user = await client.users.unlock_async(user_id=clerk_user_id)
    except Exception as error:
        logger.exception("Failed to unlock Clerk user %s", clerk_user_id)
        raise RuntimeError("Failed to unlock Clerk user.") from error

    locked = getattr(user, "locked", None)
    if isinstance(locked, bool):
        return locked
    return False


def _normalize_clerk_enum_value(value: Any, default: str) -> str:
    """
    Normalize values that might arrive as enum objects from the Clerk SDK.
    """
    if isinstance(value, str) and value.strip():
        return value.strip().lower()

    raw = getattr(value, "value", None)
    if isinstance(raw, str) and raw.strip():
        return raw.strip().lower()

    return default


async def create_application_invitation(
    email_address: str,
    *,
    public_metadata: dict[str, Any] | None = None,
    redirect_url: str | None = None,
    notify: bool = True,
    ignore_existing: bool = True,
    expires_in_days: int = 7,
) -> dict[str, Any]:
    """
    Create a Clerk application invitation and return normalized fields used by our API layer.
    """
    client = _get_clerk_client()
    if client is None:
        raise RuntimeError("Missing CLERK_SECRET_KEY; cannot create invitations.")

    request: dict[str, Any] = {
        "email_address": email_address,
        "notify": notify,
        "ignore_existing": ignore_existing,
        "expires_in_days": expires_in_days,
    }
    if public_metadata is not None:
        request["public_metadata"] = public_metadata
    if redirect_url:
        request["redirect_url"] = redirect_url

    try:
        invitation = await client.invitations.create_async(request=request)
    except Exception as error:
        logger.exception("Failed to create Clerk invitation for %s", email_address)
        raise RuntimeError("Failed to create Clerk invitation.") from error

    invitation_id = getattr(invitation, "id", None)
    if not isinstance(invitation_id, str) or not invitation_id:
        raise RuntimeError("Clerk invitation response is missing an invitation id.")

    return {
        "id": invitation_id,
        "status": _normalize_clerk_enum_value(getattr(invitation, "status", None), "pending"),
        "url": getattr(invitation, "url", None),
    }


async def revoke_application_invitation(clerk_invitation_id: str) -> None:
    """
    Revoke a Clerk application invitation.
    """
    client = _get_clerk_client()
    if client is None:
        raise RuntimeError("Missing CLERK_SECRET_KEY; cannot revoke invitations.")

    try:
        await client.invitations.revoke_async(invitation_id=clerk_invitation_id)
    except Exception as error:
        logger.exception("Failed to revoke Clerk invitation %s", clerk_invitation_id)
        raise RuntimeError("Failed to revoke Clerk invitation.") from error
