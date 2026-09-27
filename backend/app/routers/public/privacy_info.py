"""
Public privacy-policy data endpoint.

Exposes a privacy-safe projection of the active school year's document
collection requirements and the fields extracted from each required document
type, so the privacy policy page can render an accurate, up-to-date account of
what data is collected and how it is processed.

This endpoint is intentionally unauthenticated: prospective students must be
able to review the policy before creating an account. Only non-sensitive
metadata is returned (document type names/descriptions and extraction field
labels). Internal classifier metadata, analytics configuration, and AI prompts
are never exposed.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ...database import SessionDep
from ...models import (
    ExtractionSchema,
    RequirementSlot,
    RequirementSlotItem,
    SchoolYear,
    SchoolYearRequirement,
)

router = APIRouter(prefix="/api/public", tags=["public"])

# Internal field keys that must never leak into the public projection.
_PRIVATE_FIELD_KEYS = {
    "is_analytics",
    "analytics_mode",
    "analytics_group",
    "analytics_label",
    "canonical_key",
    "buckets",
    "is_computed",
    "computation",
    "readOnly",
    "ui_component",
    "hierarchy_level",
    "parent_field_id",
}


class ExtractedFieldPublic(BaseModel):
    key: str
    description: str = ""
    type: str = "string"
    options: list[str] | None = None


class RequiredDocumentPublic(BaseModel):
    name: str
    code: str
    description: str
    extractedFields: list[ExtractedFieldPublic]


class ActiveSchoolYearPublic(BaseModel):
    name: str
    startDate: date
    endDate: date
    status: str


class PrivacyInfoResponse(BaseModel):
    activeSchoolYear: ActiveSchoolYearPublic | None = None
    requiredDocuments: list[RequiredDocumentPublic]


def _sanitize_fields(fields_json: Any) -> list[ExtractedFieldPublic]:
    """Reduce an extraction schema's ``fields_json`` to a public projection."""
    if not isinstance(fields_json, list):
        return []

    sanitized: list[ExtractedFieldPublic] = []
    for field in fields_json:
        if not isinstance(field, dict):
            continue
        key = field.get("key")
        if not key:
            continue
        if key in _PRIVATE_FIELD_KEYS:
            continue

        options = field.get("options")
        option_labels: list[str] | None = None
        if isinstance(options, list):
            labels = [
                opt.get("label") or opt.get("value")
                for opt in options
                if isinstance(opt, dict) and (opt.get("label") or opt.get("value"))
            ]
            if labels:
                option_labels = labels

        sanitized.append(
            ExtractedFieldPublic(
                key=key,
                description=(field.get("description") or "").strip(),
                type=field.get("type") or "string",
                options=option_labels,
            )
        )
    return sanitized


@router.get("/privacy-info", response_model=PrivacyInfoResponse)
async def get_privacy_info(db: SessionDep) -> PrivacyInfoResponse:
    active_year = (
        await db.execute(
            select(SchoolYear)
            .where(SchoolYear.is_active.is_(True))
            .order_by(SchoolYear.updated_at.desc())
        )
    ).scalars().first()

    if active_year is None:
        return PrivacyInfoResponse(activeSchoolYear=None, requiredDocuments=[])

    slots = list(
        (
            await db.execute(
                select(RequirementSlot)
                .where(RequirementSlot.school_year_id == active_year.id)
                .order_by(RequirementSlot.display_order)
                .options(
                    selectinload(RequirementSlot.items).selectinload(
                        RequirementSlotItem.document_type
                    ),
                    selectinload(RequirementSlot.items).selectinload(
                        RequirementSlotItem.extraction_schema
                    ),
                )
            )
        ).scalars().all()
    )

    # Deduplicated projection keyed by document_type_id, preserving the first
    # slot's display order so the list reads naturally.
    documents: dict[str, RequiredDocumentPublic] = {}
    fields_cache: dict[str, list[ExtractedFieldPublic]] = {}

    def field_projection(schema: ExtractionSchema | None) -> list[ExtractedFieldPublic]:
        if schema is None:
            return []
        schema_id = str(schema.id)
        if schema_id not in fields_cache:
            fields_cache[schema_id] = _sanitize_fields(schema.fields_json)
        return fields_cache[schema_id]

    def add_document(doc_type, schema: ExtractionSchema | None) -> None:
        if doc_type is None:
            return
        doc_type_id = str(doc_type.id)
        if doc_type_id in documents:
            return
        documents[doc_type_id] = RequiredDocumentPublic(
            name=doc_type.name or "",
            code=doc_type.code or "",
            description=doc_type.description or "",
            extractedFields=field_projection(schema),
        )

    if slots:
        for slot in slots:
            for item in slot.items or []:
                add_document(item.document_type, item.extraction_schema)
    else:
        legacy_rows = list(
            (
                await db.execute(
                    select(SchoolYearRequirement)
                    .where(SchoolYearRequirement.school_year_id == active_year.id)
                    .options(
                        selectinload(SchoolYearRequirement.document_type),
                        selectinload(SchoolYearRequirement.extraction_schema),
                    )
                    .order_by(
                        SchoolYearRequirement.created_at,
                        SchoolYearRequirement.id,
                    )
                )
            ).scalars().all()
        )
        for row in legacy_rows:
            add_document(row.document_type, row.extraction_schema)

    return PrivacyInfoResponse(
        activeSchoolYear=ActiveSchoolYearPublic(
            name=active_year.name,
            startDate=active_year.start_date,
            endDate=active_year.end_date,
            status=active_year.status.value,
        ),
        requiredDocuments=list(documents.values()),
    )
