from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .extraction_schemas import ExtractionSchemaField


class FormBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    document_json: dict[str, Any] = Field(
        default_factory=dict,
        description="Editable form document: { header, footer, body: [blocks] }.",
    )


class FormCreate(FormBase):
    pass


class FormUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    document_json: dict[str, Any] | None = None


class FormResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    description: str | None
    document_json: dict[str, Any]
    pdf_file_key: str | None
    extraction_schema_id: UUID | None
    created_at: datetime
    updated_at: datetime


class FormGenerateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=4000)


class FormGenerateResponse(BaseModel):
    document_json: dict[str, Any]
    fields_json: list[ExtractionSchemaField]
    form_name: str
    form_control_id: str
