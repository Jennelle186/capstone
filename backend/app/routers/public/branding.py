"""Public branding projection.

Auth, loading, and print surfaces need the institution logo before a user signs
in, so this endpoint is intentionally unauthenticated. It exposes only display
data (name, address, contact, logo URL) — never internal keys.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from ...database import SessionDep
from ...models import BrandingSettings
from ...services.gcp_storage import generate_presigned_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public", tags=["public"])


class PublicBrandingResponse(BaseModel):
    institution_name: str | None
    address_lines: list[str]
    contact_line: str | None
    logo_url: str | None


@router.get("/branding", response_model=PublicBrandingResponse)
async def get_public_branding(db: SessionDep = None):
    settings = (
        await db.execute(select(BrandingSettings).where(BrandingSettings.id == 1))
    ).scalar_one_or_none()

    if settings is None:
        return PublicBrandingResponse(
            institution_name=None,
            address_lines=[],
            contact_line=None,
            logo_url=None,
        )

    logo_url = None
    if settings.logo_file_key:
        try:
            logo_url = generate_presigned_url(settings.logo_file_key)
        except Exception:
            logger.warning("Failed to presign public branding logo %s", settings.logo_file_key)

    return PublicBrandingResponse(
        institution_name=settings.institution_name,
        address_lines=list(settings.address_lines or []),
        contact_line=settings.contact_line,
        logo_url=logo_url,
    )
