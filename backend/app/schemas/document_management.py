from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from ..models import DocumentTypeStatus, StudentClassification


class StudentClassificationSchema(str, Enum):
    REGULAR = "regular"
    TRANSFEREE = "transferee"
    SHIFTEE = "shiftee"


class DocumentTypeResponse(BaseModel):
    id: UUID
    name: str
    code: str
    description: str
    classifier_description: str | None
    keywords: list[str]
    applicable_classifications: list[StudentClassificationSchema]
    status: DocumentTypeStatus
    created_at: datetime
    updated_at: datetime


class DocumentTypeCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1)
    classifier_description: str | None = None
    keywords: list[str] = Field(default_factory=list)
    applicable_classifications: list[StudentClassificationSchema] = Field(default_factory=list)
    status: DocumentTypeStatus = DocumentTypeStatus.ACTIVE

    @field_validator("name", "description")
    @classmethod
    def validate_non_empty_trimmed(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Document code is required.")
        return normalized

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, value: list[str]) -> list[str]:
        deduped: list[str] = []
        seen: set[str] = set()
        for keyword in value:
            normalized = keyword.strip()
            if not normalized:
                continue
            lowered = normalized.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            deduped.append(normalized)
        return deduped

    @field_validator("applicable_classifications")
    @classmethod
    def normalize_classifications(cls, value: list[StudentClassificationSchema]) -> list[StudentClassificationSchema]:
        seen: set[str] = set()
        deduped: list[StudentClassificationSchema] = []
        for item in value:
            if item.value in seen:
                continue
            seen.add(item.value)
            deduped.append(item)
        return deduped


class DocumentTypeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, min_length=1)
    classifier_description: str | None = None
    keywords: list[str] | None = None
    applicable_classifications: list[StudentClassificationSchema] | None = None
    status: DocumentTypeStatus | None = None

    @field_validator("name", "description")
    @classmethod
    def validate_optional_non_empty_trimmed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value is required.")
        return normalized

    @field_validator("code")
    @classmethod
    def normalize_optional_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Document code is required.")
        return normalized

    @field_validator("keywords")
    @classmethod
    def normalize_optional_keywords(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        deduped: list[str] = []
        seen: set[str] = set()
        for keyword in value:
            normalized = keyword.strip()
            if not normalized:
                continue
            lowered = normalized.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            deduped.append(normalized)
        return deduped

    @field_validator("applicable_classifications")
    @classmethod
    def normalize_optional_classifications(
        cls, value: list[StudentClassificationSchema] | None
    ) -> list[StudentClassificationSchema] | None:
        if value is None:
            return None
        seen: set[str] = set()
        deduped: list[StudentClassificationSchema] = []
        for item in value:
            if item.value in seen:
                continue
            seen.add(item.value)
            deduped.append(item)
        return deduped


class RequirementAssignmentItem(BaseModel):
    document_type_id: UUID
    admission_form_schema_id: UUID | None = None


class RequirementAssignmentRequest(BaseModel):
    school_year_id: UUID
    document_type_ids: list[UUID] = Field(default_factory=list)
    requirements: list[RequirementAssignmentItem] | None = None

    @field_validator("document_type_ids")
    @classmethod
    def dedupe_document_type_ids(cls, value: list[UUID]) -> list[UUID]:
        deduped: list[UUID] = []
        seen: set[UUID] = set()
        for document_type_id in value:
            if document_type_id in seen:
                continue
            seen.add(document_type_id)
            deduped.append(document_type_id)
        return deduped


class RequirementAssignmentResponse(BaseModel):
    school_year_id: UUID
    document_type_ids: list[UUID]
    requirements: list[RequirementAssignmentItem] = Field(default_factory=list)
