from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .extraction_schemas import ExtractionSchemaField
from .form_layout import create_empty_document


class FormBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    creation_mode: Literal["structured"] = Field(default="structured", max_length=32)
    document_type_id: UUID | None = None
    extraction_schema_id: UUID | None = None
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
    extraction_schema_id: UUID | None = None
    document_json: dict[str, Any] | None = None


class FormResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    description: str | None
    creation_mode: str
    document_type_id: UUID | None
    extraction_schema_id: UUID | None
    extraction_schema_name: str | None = None
    document_json: dict[str, Any]
    pdf_file_key: str | None
    created_at: datetime
    updated_at: datetime


class DraftSchemaResponse(BaseModel):
    """Result of creating a draft extraction schema from a saved form."""
    schema_id: UUID
    form_id: UUID
    schema_name: str


class SyncSchemaResponse(BaseModel):
    """Result of syncing a form's field keys into its linked extraction schema."""
    added: list[str] = Field(default_factory=list)
    updated: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    blocked_removals: list[str] = Field(default_factory=list)


class FormGenerateRequest(BaseModel):
    description: str = Field(
        default="",
        max_length=4000,
        description=(
            "Optional layout instructions when grounding on a field catalog. "
            "Required when no catalog is provided."
        ),
    )
    fields: list[ExtractionSchemaField] | None = Field(
        default=None,
        description=(
            "Optional field catalog to ground the layout on; when omitted, "
            "Gemini invents fields from the description."
        ),
    )

    @field_validator("description")
    @classmethod
    def _strip_description(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _validate_generation_input(self) -> FormGenerateRequest:
        if self.fields is not None and not self.fields:
            raise ValueError(
                "Provide at least one field when grounding on an extraction schema."
            )
        if self.fields is None and not self.description:
            raise ValueError(
                "Describe the form when no extraction schema is provided."
            )
        return self


class FormGenerateResponse(BaseModel):
    document_json: dict[str, Any]
    fields_json: list[ExtractionSchemaField]
    form_name: str
    form_control_id: str
    warnings: list[str] = Field(default_factory=list)
