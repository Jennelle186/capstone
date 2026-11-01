"""Pydantic schemas for the admin management module."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AdminResponse(BaseModel):
    id: UUID
    name: str
    email: str | None
    created_at: datetime
    updated_at: datetime


class AdminInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("Email is required.")
        return normalized

    @field_validator("first_name", "last_name")
    @classmethod
    def normalize_required(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field is required.")
        return normalized

    @field_validator("middle_name")
    @classmethod
    def normalize_optional(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AdminInvitationResponse(BaseModel):
    id: UUID
    email: str
    first_name: str | None
    middle_name: str | None
    last_name: str | None
    status: str
    invited_by_user_id: UUID | None
    accepted_user_id: UUID | None
    expires_at: datetime | None
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PromoteRequest(BaseModel):
    adviser_id: UUID
