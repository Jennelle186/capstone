from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..models import AdmissionFormSchemaStatus


SchemaFieldType = Literal["string", "number", "integer", "boolean"]


class AdmissionSchemaField(BaseModel):
    id: str = Field(min_length=1)
    key: str = Field(min_length=1, max_length=120)
    type: SchemaFieldType = "string"
    description: str = ""
    required: bool = False

    @field_validator("key")
    @classmethod
    def normalize_key(cls, value: str) -> str:
        normalized = value.strip().lower().replace(" ", "_")
        if not normalized:
            raise ValueError("Field name is required.")
        return normalized

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str) -> str:
        return value.strip()

class AdmissionFormSchemaBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=120)
    version_label: str | None = Field(default=None, max_length=80)
    effective_date: date | None = None
    description: str | None = None
    extraction_schema: dict[str, Any] = Field(default_factory=dict, alias="schema_json")
    fields_json: list[AdmissionSchemaField] = Field(default_factory=list)
    status: AdmissionFormSchemaStatus = AdmissionFormSchemaStatus.DRAFT
    source_file_name: str | None = Field(default=None, max_length=255)
    generation_prompt: str | None = None

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Schema name is required.")
        return normalized

    @field_validator("version_label", "description", "generation_prompt")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def ensure_schema_json(self) -> "AdmissionFormSchemaBase":
        if self.extraction_schema:
            return self

        properties: dict[str, dict[str, str]] = {}
        required: list[str] = []
        for field in self.fields_json:
            properties[field.key] = {
                "type": field.type,
                "description": field.description,
            }
            if field.required:
                required.append(field.key)

        self.extraction_schema = {
            "type": "object",
            "properties": properties,
        }
        if required:
            self.extraction_schema["required"] = required
        return self


class AdmissionFormSchemaCreateRequest(AdmissionFormSchemaBase):
    pass


class AdmissionFormSchemaUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    version_label: str | None = Field(default=None, max_length=80)
    effective_date: date | None = None
    description: str | None = None
    extraction_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    fields_json: list[AdmissionSchemaField] | None = None
    status: AdmissionFormSchemaStatus | None = None
    source_file_name: str | None = Field(default=None, max_length=255)
    generation_prompt: str | None = None

    @field_validator("name")
    @classmethod
    def trim_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Schema name is required.")
        return normalized

    @field_validator("version_label", "description", "generation_prompt")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AdmissionFormSchemaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    version_label: str | None
    effective_date: date | None
    description: str | None
    extraction_schema: dict[str, Any] = Field(alias="schema_json")
    fields_json: list[AdmissionSchemaField]
    status: AdmissionFormSchemaStatus
    source_file_name: str | None
    generation_prompt: str | None
    created_at: datetime
    updated_at: datetime


class AdmissionFormSchemaGenerateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    extraction_schema: dict[str, Any] = Field(alias="schema_json")
    fields_json: list[AdmissionSchemaField]
    file_id: str
    source_file_name: str | None = None
