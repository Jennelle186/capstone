"""Schemas for the Phase 4B online form fill (``form_submissions``)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FormSubmissionResponse(BaseModel):
    """A student's typed-in answers for a printable form."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    form_id: UUID | None
    document_type_id: UUID | None
    school_year_id: UUID | None
    values: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime


class FormFillResponse(BaseModel):
    """Everything the fill page needs to render and resume a form."""

    form_id: UUID | None
    form_name: str
    document_json: dict[str, Any]
    submission: FormSubmissionResponse | None = None


class FilledFormResponse(BaseModel):
    """A filled-online document's layout + typed values, for preview/print."""

    form_id: UUID | None
    form_name: str
    document_json: dict[str, Any]
    values: dict[str, Any] = Field(default_factory=dict)


class SaveFormSubmissionRequest(BaseModel):
    """Save a draft (upsert the single draft row for the item)."""

    values: dict[str, Any] = Field(default_factory=dict)


class SubmitFormSubmissionRequest(BaseModel):
    """Finalize a submission with the given values."""

    values: dict[str, Any] = Field(default_factory=dict)
