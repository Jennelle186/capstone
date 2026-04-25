from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from ..models import DocumentTypeStatus


class DocumentTypeResponse(BaseModel):
    id: UUID
    name: str
    code: str
    description: str
    classifier_description: str | None
    keywords: list[str]
    status: DocumentTypeStatus
    created_at: datetime
    updated_at: datetime


class DocumentTypeCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1)
    classifier_description: str | None = None
    keywords: list[str] = Field(default_factory=list)
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


class DocumentTypeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, min_length=1)
    classifier_description: str | None = None
    keywords: list[str] | None = None
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


class RequirementAssignmentRequest(BaseModel):
    school_year_id: UUID
    document_type_ids: list[UUID] = Field(default_factory=list)

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
