"""Global branding settings (institution name, address, contact, logo).

The logo is uploaded directly to GCS via a presigned PUT URL and recorded as a
stable ``logo_file_key``. The API never stores signed URLs — it mints a fresh
short-lived read URL when returning settings.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from ...database import SessionDep
from ...models import BrandingSettings
from ...rbac import require_admin
from ...schemas.branding import (
    BrandingSettingsResponse,
    BrandingSettingsUpdate,
    LogoUploadRequest,
    LogoUploadResponse,
)
from ...services.gcp_storage import (
    delete_file as gcs_delete_file,
    generate_presigned_post,
    generate_presigned_url,
    head_object,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/branding")

BRANDING_LOGO_PREFIX = "branding/"
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}
MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024


async def _get_settings(db: SessionDep) -> BrandingSettings:
    settings = (await db.execute(select(BrandingSettings).where(BrandingSettings.id == 1))).scalar_one_or_none()
    if settings is None:
        settings = BrandingSettings(id=1, address_lines=[])
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


def _serialize(settings: BrandingSettings) -> BrandingSettingsResponse:
    logo_url = None
    if settings.logo_file_key:
        try:
            logo_url = generate_presigned_url(settings.logo_file_key)
        except HTTPException:
            logger.warning("Failed to presign branding logo %s", settings.logo_file_key)
    return BrandingSettingsResponse(
        institution_name=settings.institution_name,
        address_lines=list(settings.address_lines or []),
        contact_line=settings.contact_line,
        logo_url=logo_url,
        updated_at=settings.updated_at,
    )


@router.get("/settings", response_model=BrandingSettingsResponse)
async def get_branding_settings(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    return _serialize(await _get_settings(db))


@router.patch("/settings", response_model=BrandingSettingsResponse)
async def update_branding_settings(
    payload: BrandingSettingsUpdate,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    settings = await _get_settings(db)

    if "institution_name" in payload.model_fields_set:
        settings.institution_name = payload.institution_name
    if "address_lines" in payload.model_fields_set:
        settings.address_lines = [line for line in (payload.address_lines or [])]
    if "contact_line" in payload.model_fields_set:
        settings.contact_line = payload.contact_line

    await db.commit()
    await db.refresh(settings)
    return _serialize(settings)


@router.post("/logo/upload-url", response_model=LogoUploadResponse)
async def create_logo_upload_url(
    payload: LogoUploadRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Return a presigned PUT URL; the browser uploads the logo directly to GCS."""
    del current_user
    del db

    content_type = payload.content_type.strip().lower()
    extension = ALLOWED_LOGO_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported logo type. Use PNG, JPEG, WebP, or SVG.",
        )

    stem = Path(payload.filename or "logo").stem[:60] or "logo"
    safe_stem = "".join(ch for ch in stem if ch.isalnum() or ch in "-_") or "logo"
    key = f"{BRANDING_LOGO_PREFIX}{uuid.uuid4().hex}-{safe_stem}{extension}"
    presigned = generate_presigned_post(key, content_type, max_size_bytes=MAX_LOGO_SIZE_BYTES)
    return LogoUploadResponse(upload_url=presigned["url"], file_key=key, content_type=content_type)


@router.post("/logo/{file_key:path}/confirm", response_model=BrandingSettingsResponse)
async def confirm_logo_upload(
    file_key: str,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Verify the uploaded object exists, then point branding at it."""
    del current_user

    if not file_key.startswith(BRANDING_LOGO_PREFIX):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid logo key.")

    try:
        meta = await asyncio.to_thread(head_object, file_key)
    except HTTPException as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc.detail)) from exc

    size = meta.get("size") or 0
    if size > MAX_LOGO_SIZE_BYTES:
        await asyncio.to_thread(gcs_delete_file, file_key)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Logo exceeds the 5 MB limit.",
        )

    settings = await _get_settings(db)
    previous_key = settings.logo_file_key
    settings.logo_file_key = file_key
    settings.logo_content_type = meta.get("content_type") or None
    await db.commit()
    await db.refresh(settings)

    if previous_key and previous_key != file_key:
        try:
            await asyncio.to_thread(gcs_delete_file, previous_key)
        except Exception:
            logger.exception("Failed to delete previous branding logo %s", previous_key)

    return _serialize(settings)
