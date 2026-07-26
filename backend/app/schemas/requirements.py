from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SlotItemResponse(BaseModel):
    """A document type that can satisfy a requirement slot."""
    id: UUID
    slot_id: UUID = Field(alias="requirement_slot_id")
    document_type_id: UUID
    document_type_name: str
    document_type_code: str
    extraction_schema_id: UUID | None = None
    extraction_schema_name: str | None = None
    is_primary: bool
    display_order: int

    model_config = {"populate_by_name": True, "from_attributes": True}


class SlotResponse(BaseModel):
    """A requirement slot for a school year."""
    id: UUID
    school_year_id: UUID
    slot_type: Literal["solo", "group"]
    group_name: str | None = None
    description: str | None = None
    min_required: int
    display_order: int
    items: list[SlotItemResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── Student-facing slot status ──────────────────────────────────────────


class SlotItemStatus(BaseModel):
    """Document type entry within a slot, shown to students."""
    document_type_id: UUID
    document_type_name: str
    document_type_code: str
    is_primary: bool


class SlotStatusResponse(BaseModel):
    """A requirement slot with real-time completion status for the student."""
    id: UUID
    slot_type: Literal["solo", "group"]
    group_name: str | None = None
    description: str | None = None
    min_required: int
    display_order: int
    items: list[SlotItemStatus] = Field(default_factory=list)
    is_complete: bool
    matched_submission_ids: list[UUID] = Field(default_factory=list)
    matched_count: int


class RequiredSlotsResponse(BaseModel):
    """Response wrapper for GET /api/me/required-slots."""
    school_year_id: str | None
    school_year_name: str | None
    classification: str | None
    slots: list[SlotStatusResponse] = Field(default_factory=list)


# ── Admin slot assignment ───────────────────────────────────────────────


class SlotItemAssignment(BaseModel):
    """A single document type assignment within a slot."""
    id: UUID | None = None  # None for new items, UUID for existing
    document_type_id: UUID
    extraction_schema_id: UUID | None = None
    is_primary: bool = False
    display_order: int = 0

    @field_validator("is_primary")
    @classmethod
    def coerce_is_primary(cls, value: bool) -> bool:
        return bool(value)


class SlotAssignment(BaseModel):
    """A complete slot definition sent by the admin UI."""
    id: UUID | None = None  # None for new slots, UUID for existing
    slot_type: Literal["solo", "group"]
    group_name: str | None = None
    description: str | None = None
    min_required: int = 1
    display_order: int
    items: list[SlotItemAssignment] = Field(default_factory=list)

    @field_validator("min_required")
    @classmethod
    def validate_min_required(cls, value: int) -> int:
        if value < 1:
            raise ValueError("min_required must be >= 1")
        return value

    @field_validator("group_name")
    @classmethod
    def validate_group_name(cls, value: str | None, _info: Any) -> str | None:
        if value is not None:
            stripped = value.strip()
            if stripped:
                return stripped
        return None


class SlotAssignmentRequest(BaseModel):
    """Full payload for PUT /api/admin/requirement-slots."""
    school_year_id: UUID
    slots: list[SlotAssignment] = Field(default_factory=list)


class SlotAssignmentResponse(BaseModel):
    """Response after saving slot assignments."""
    school_year_id: UUID
    slots: list[SlotResponse] = Field(default_factory=list)
