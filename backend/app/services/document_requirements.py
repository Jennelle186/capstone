from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, select

from ..database import SessionDep
from ..models import DocumentType, DocumentTypeStatus, SchoolYear, SchoolYearRequirement, SchoolYearStatus

# This module contains service functions for managing document requirements associated with school years.
async def get_school_year_or_404(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await db.get(SchoolYear, school_year_id)
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    return school_year

# This function ensures that a document type code is unique across all document types, optionally excluding a specific document type ID.
async def ensure_school_year_requirements_mutable(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await get_school_year_or_404(db, school_year_id)
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed school years cannot be modified.",
        )
    return school_year

# This function retrieves the list of document type IDs that are required for a specific school year, ordered by the most recently updated or created requirements.
async def list_school_year_requirement_ids(db: SessionDep, school_year_id: UUID) -> list[UUID]:
    await get_school_year_or_404(db, school_year_id)

    stmt = (
        select(SchoolYearRequirement.document_type_id)
        .where(SchoolYearRequirement.school_year_id == school_year_id)
        .order_by(desc(SchoolYearRequirement.updated_at), desc(SchoolYearRequirement.created_at))
    )
    return list((await db.execute(stmt)).scalars().all())

# This function replaces the document type requirements for a specific school year with a new list of document type IDs, ensuring that the school year is mutable and that all provided document type IDs are valid and active.
async def validate_active_document_type_ids(db: SessionDep, document_type_ids: list[UUID]) -> None:
    if not document_type_ids:
        return

    existing_stmt = select(DocumentType.id).where(
        DocumentType.id.in_(document_type_ids),
        DocumentType.status == DocumentTypeStatus.ACTIVE,
    )
    existing_ids = set((await db.execute(existing_stmt)).scalars().all())
    missing_or_inactive = [doc_id for doc_id in document_type_ids if doc_id not in existing_ids]
    if missing_or_inactive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more document types are missing or not active.",
        )

# This function replaces the document type requirements for a specific school year with a new list of document type IDs, ensuring that the school year is mutable and that all provided document type IDs are valid and active. It first deletes any existing requirements for the school year and then adds new requirements based on the provided list of document type IDs.
async def replace_school_year_requirement_ids(
    db: SessionDep,
    school_year_id: UUID,
    document_type_ids: list[UUID],
) -> list[UUID]:
    await ensure_school_year_requirements_mutable(db, school_year_id)
    await validate_active_document_type_ids(db, document_type_ids)

    await db.execute(
        delete(SchoolYearRequirement).where(SchoolYearRequirement.school_year_id == school_year_id)
    )

    for document_type_id in document_type_ids:
        db.add(
            SchoolYearRequirement(
                school_year_id=school_year_id,
                document_type_id=document_type_id,
            )
        )

    await db.commit()
    return document_type_ids

# This function carries over the document type requirements from a source school year to a target school year, ensuring that the source and target school years are different, that the source school year exists, and that the target school year is mutable. It retrieves the active document type IDs from the source school year and then replaces the requirements for the target school year with those IDs.

async def carry_over_school_year_requirement_ids(
    db: SessionDep,
    source_school_year_id: UUID,
    target_school_year_id: UUID,
) -> list[UUID]:
    if source_school_year_id == target_school_year_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target school years must be different.",
        )

    await get_school_year_or_404(db, source_school_year_id)
    await ensure_school_year_requirements_mutable(db, target_school_year_id)

    stmt = (
        select(SchoolYearRequirement.document_type_id)
        .join(DocumentType, DocumentType.id == SchoolYearRequirement.document_type_id)
        .where(
            SchoolYearRequirement.school_year_id == source_school_year_id,
            DocumentType.status == DocumentTypeStatus.ACTIVE,
        )
        .order_by(desc(SchoolYearRequirement.updated_at), desc(SchoolYearRequirement.created_at))
    )
    source_document_type_ids = list((await db.execute(stmt)).scalars().all())
    return await replace_school_year_requirement_ids(db, target_school_year_id, source_document_type_ids)



