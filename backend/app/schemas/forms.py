from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from .extraction_schemas import ExtractionSchemaField
from .form_layout import create_empty_document


class FormBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    creation_mode: Literal["structured"] = Field(default="structured", max_length=32)
    document_type_id: UUID | None = None
    document_json: dict[str, Any] = Field(
        default_factory=create_empty_document,
        description="Editable form document: a versioned, structured document.",
    )


class FormCreate(FormBase):
    pass


class FormUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    creation_mode: Literal["structured"] | None = Field(default=None, max_length=32)
    document_type_id: UUID | None = None
    document_json: dict[str, Any] | None = None


class FormResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    description: str | None
    creation_mode: str
    document_type_id: UUID | None
    document_json: dict[str, Any]
    pdf_file_key: str | None
    extraction_schema_id: UUID | None
    created_at: datetime
    updated_at: datetime


class FormGenerateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=4000)
    fields: list[ExtractionSchemaField] | None = Field(
        default=None,
        description="Optional field catalog to ground the layout on; when omitted, Gemini invents fields from the description.",
    )


class FormGenerateResponse(BaseModel):
    document_json: dict[str, Any]
    fields_json: list[ExtractionSchemaField]
    form_name: str
    form_control_id: str
    warnings: list[str] = Field(default_factory=list)
