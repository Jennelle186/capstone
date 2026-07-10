from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

AnalyticsMode = Literal["distribution", "numeric_summary", "boolean_summary"]

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..models import ExtractionSchemaStatus


SchemaFieldType = Literal["string", "number", "integer", "boolean", "select", "multi-select"]


class FieldOption(BaseModel):
    value: str = Field(description="System key for the option (snake_case).")
    label: str = Field(description="The literal text printed on the form.")


class ExtractionSchemaField(BaseModel):
    id: str = Field(min_length=1)
    key: str = Field(min_length=1, max_length=120)
    type: SchemaFieldType = "string"
    description: str = ""
    required: bool = False
    readOnly: bool = Field(default=False, description="Admins lock fields; students cannot edit them.")
    ui_component: str | None = Field(default=None, description="UI entry type: text_input, radio_group, checkbox_group, dropdown, date_picker")
    hierarchy_level: int = Field(default=1, description="Nesting depth: 1 for top-level, 2+ for nested items")
    parent_field_id: str | None = Field(default=None, description="If nested under another field, reference its field_id")
    options: list[FieldOption] | None = Field(default=None, description="For choice inputs, the list of options printed on the form")
    section_id: str | None = Field(default=None, description="Logical section this field belongs to")
    section_title: str | None = Field(default=None, description="Visual header title of the section")

    is_analytics: bool = Field(default=False, description="Mark field for analytics aggregation")
    analytics_mode: AnalyticsMode | None = Field(default=None, description="Override aggregation mode; inferred from field type if unset")
    analytics_group: str | None = Field(default=None, description="UI group heading in the Snapshot tab")
    analytics_label: str | None = Field(default=None, description="Display label in analytics UIs; falls back to field label")
    canonical_key: str | None = Field(default=None, description="Semantic key for cross-year alignment (e.g. 'shs_track', 'gender')")

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


class AdminBuilderField(BaseModel):
    field_id: str = Field(description="Unique system identifier (e.g. 'enrollment_status').")
    label: str = Field(description="The physical text label next to the input area.")
    data_type: str = Field(description="System primitive: 'string', 'number', 'boolean', 'array'.")
    ui_component: str = Field(description="UI entry type: 'text_input', 'radio_group', 'checkbox_group', 'dropdown', 'date_picker'.")
    hierarchy_level: int = Field(default=1, description="Nesting depth: 1 for base fields, 2+ for items nested under a parent.")
    parent_field_id: str | None = Field(default=None, description="If nested under another field, reference its field_id.")
    required: bool = Field(default=False, description="Whether this field is mandatory (marked with asterisk, 'required' label, or cannot be left blank).")
    options: list[FieldOption] | None = Field(default=None, description="For choice inputs, all options printed on the page.")


class AdminBuilderSection(BaseModel):
    section_id: str = Field(description="Unique key for the logical form block (e.g. 'admission_details').")
    section_title: str = Field(description="The visual header title of the block (e.g. 'STUDENT PERSONAL DATA').")
    fields: list[AdminBuilderField] = Field(description="The structured list of fields under this section.")


class AdminSchemaBlueprint(BaseModel):
    form_name: str = Field(description="The overarching document name at the top header.")
    form_control_id: str = Field(description="Document routing/version code (e.g. 'WMSU-AO-FR-001.02').")
    sections: list[AdminBuilderSection] = Field(description="The top-level logical sections dividing the form layout.")


class ExtractionSchemaBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=120)
    version_label: str | None = Field(default=None, max_length=80)
    effective_date: date | None = None
    description: str | None = None
    extraction_schema: dict[str, Any] = Field(default_factory=dict, alias="schema_json")
    fields_json: list[ExtractionSchemaField] = Field(default_factory=list)
    document_type_id: UUID | None = None
    status: ExtractionSchemaStatus = ExtractionSchemaStatus.DRAFT
    source_file_name: str | None = Field(default=None, max_length=255)
    generation_prompt: str | None = None
    sample_file_keys: list[str] | None = None

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
    def ensure_schema_json(self) -> "ExtractionSchemaBase":
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


class ExtractionSchemaCreateRequest(ExtractionSchemaBase):
    pass


class ExtractionSchemaUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    version_label: str | None = Field(default=None, max_length=80)
    effective_date: date | None = None
    description: str | None = None
    extraction_schema: dict[str, Any] | None = Field(default=None, alias="schema_json")
    fields_json: list[ExtractionSchemaField] | None = None
    document_type_id: UUID | None = None
    status: ExtractionSchemaStatus | None = None
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


class ExtractionSchemaResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    version_label: str | None
    effective_date: date | None
    description: str | None
    extraction_schema: dict[str, Any] = Field(alias="schema_json")
    fields_json: list[ExtractionSchemaField]
    document_type_id: UUID | None
    status: ExtractionSchemaStatus
    source_file_name: str | None
    generation_prompt: str | None
    created_at: datetime
    updated_at: datetime


class ExtractionSchemaGenerateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    extraction_schema: dict[str, Any] = Field(alias="schema_json")
    fields_json: list[ExtractionSchemaField]
    file_id: str
    source_file_name: str | None = None
    document_type_id: UUID | None = None
    effective_date: str | None = None


class SandboxFieldResult(BaseModel):
    key: str = ""
    label: str = ""
    type: str = "string"
    value: str = ""
    confidence: float = 0.0


class SandboxClassificationResult(BaseModel):
    document_type_id: str | None = None
    document_type_name: str = ""
    document_type_code: str = ""
    confidence: float = 0.0
    reasoning: str = ""


class SandboxSchemaInfo(BaseModel):
    id: str
    name: str


class SandboxExtractionResponse(BaseModel):
    classification: SandboxClassificationResult
    schema_info: SandboxSchemaInfo | None = None
    fields: list[SandboxFieldResult] = []
