from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BrandingSettingsResponse(BaseModel):
    institution_name: str | None
    address_lines: list[str]
    contact_line: str | None
    logo_url: str | None
    updated_at: datetime | None


class BrandingSettingsUpdate(BaseModel):
    institution_name: str | None = Field(default=None, max_length=200)
    address_lines: list[str] | None = None
    contact_line: str | None = Field(default=None, max_length=200)


class LogoUploadRequest(BaseModel):
    content_type: str = Field(min_length=1, max_length=100)
    filename: str | None = Field(default=None, max_length=255)


class LogoUploadResponse(BaseModel):
    upload_url: str
    file_key: str
    content_type: str
