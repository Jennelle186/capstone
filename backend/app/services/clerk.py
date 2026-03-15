from __future__ import annotations

import logging
import os
from typing import Any

from clerk_backend_api.sdk import Clerk

logger = logging.getLogger(__name__)


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
) -> tuple[str | None, str | None, str | None, dict[str, Any] | None]:
    """
    Fetch email, first_name, last_name, and public_metadata from Clerk for the given user id. 
    """
    client = _get_clerk_client()
    if client is None:
        return None, None, None, None

    try:
        user = await client.users.get_async(user_id=clerk_user_id)
    except Exception:
        logger.exception("Failed to fetch Clerk user for %s", clerk_user_id)
        return None, None, None, None

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

    return email, first_name, last_name, public_metadata


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
