from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, select

from ..database import SessionDep
from ..schemas.document_management import (
    SchemaRegistryEntry,
    SchemaRegistryRequirementInfo,
    SchemaRegistryResponse,
    SchemaRegistrySchemaBrief,
)
from ..models import (
    ExtractionSchema,
    ExtractionSchemaStatus,
    DocumentType,
    DocumentTypeStatus,
    SchoolYear,
    SchoolYearRequirement,
    SchoolYearStatus,
    Student,
)

RequirementAssignmentData = tuple[UUID, UUID | None]

logger = logging.getLogger(__name__)

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
async def list_school_year_requirements(db: SessionDep, school_year_id: UUID) -> list[RequirementAssignmentData]:
    await get_school_year_or_404(db, school_year_id)

    stmt = (
        select(SchoolYearRequirement.document_type_id, SchoolYearRequirement.extraction_schema_id)
        .where(SchoolYearRequirement.school_year_id == school_year_id)
        .order_by(desc(SchoolYearRequirement.updated_at), desc(SchoolYearRequirement.created_at))
    )
    return list((await db.execute(stmt)).all())


async def list_school_year_requirement_ids(db: SessionDep, school_year_id: UUID) -> list[UUID]:
    requirements = await list_school_year_requirements(db, school_year_id)
    return [document_type_id for document_type_id, _ in requirements]

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

async def validate_requirement_assignments(
    db: SessionDep,
    requirements: list[RequirementAssignmentData],
    school_year_id: UUID,
) -> None:
    document_type_ids = [document_type_id for document_type_id, _ in requirements]
    if not document_type_ids:
        return

    dt_stmt = select(DocumentType.id, DocumentType.status).where(
        DocumentType.id.in_(document_type_ids)
    )
    dt_rows = dict((await db.execute(dt_stmt)).all())

    not_found = [id_ for id_ in document_type_ids if id_ not in dt_rows]
    if not_found:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more document types are missing or not active.",
        )

    archived_ids = [id_ for id_, s in dt_rows.items() if s == DocumentTypeStatus.ARCHIVED]
    if archived_ids:
        existing_req_stmt = select(SchoolYearRequirement.document_type_id).where(
            SchoolYearRequirement.school_year_id == school_year_id,
            SchoolYearRequirement.document_type_id.in_(archived_ids),
        )
        existing_archived_reqs = set((await db.execute(existing_req_stmt)).scalars().all())
        not_existing = [id_ for id_ in archived_ids if id_ not in existing_archived_reqs]
        if not_existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Archived document types cannot be added as new requirements.",
            )

    schema_ids = {
        schema_id
        for _, schema_id in requirements
        if schema_id is not None
    }
    if schema_ids:
        schema_stmt = select(ExtractionSchema.id).where(
            ExtractionSchema.id.in_(schema_ids),
            ExtractionSchema.status != ExtractionSchemaStatus.ARCHIVED,
        )
        found = set((await db.execute(schema_stmt)).scalars().all())
        missing = schema_ids - found
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more extraction schemas are missing or archived.",
            )


def dedupe_requirement_assignments(requirements: list[RequirementAssignmentData]) -> list[RequirementAssignmentData]:
    deduped: list[RequirementAssignmentData] = []
    seen: set[UUID] = set()
    for document_type_id, schema_id in requirements:
        if document_type_id in seen:
            continue
        seen.add(document_type_id)
        deduped.append((document_type_id, schema_id))
    return deduped


async def replace_school_year_requirements(
    db: SessionDep,
    school_year_id: UUID,
    requirements: list[RequirementAssignmentData],
) -> list[RequirementAssignmentData]:
    await ensure_school_year_requirements_mutable(db, school_year_id)
    deduped_requirements = dedupe_requirement_assignments(requirements)
    await validate_requirement_assignments(db, deduped_requirements, school_year_id)

    await db.execute(
        delete(SchoolYearRequirement).where(SchoolYearRequirement.school_year_id == school_year_id)
    )

    for document_type_id, extraction_schema_id in deduped_requirements:
        snapshot = None
        if extraction_schema_id:
            schema = await db.get(ExtractionSchema, extraction_schema_id)
            if schema:
                snapshot = schema.fields_json
        db.add(
            SchoolYearRequirement(
                school_year_id=school_year_id,
                document_type_id=document_type_id,
                extraction_schema_id=extraction_schema_id,
                snapshot_fields_json=snapshot,
            )
        )

    await db.commit()
    return deduped_requirements


async def get_required_document_types_for_student(
    db: SessionDep,
    student: Student,
) -> list[DocumentType]:
    """
    Returns document types required for the student's school year,
    filtered by the student's classification.

    The SchoolYearRequirement join is the correct temporal boundary.
    A document type's current global ``status`` (active/archived) should
    NOT retroactively remove it from older cohorts that still have it
    assigned — otherwise archiving a type in 2026-2027 would silently
    clear requirements for 2025-2026 students.
    """
    if student.school_year_id is None:
        return []

    stmt = (
        select(DocumentType)
        .join(
            SchoolYearRequirement,
            SchoolYearRequirement.document_type_id == DocumentType.id,
        )
        .where(
            SchoolYearRequirement.school_year_id == student.school_year_id,
        )
        .order_by(DocumentType.name)
    )
    document_types = list((await db.execute(stmt)).scalars().all())

    classification = student.classification
    if classification is None:
        return document_types

    filtered: list[DocumentType] = []
    for dt in document_types:
        applicable = dt.applicable_classifications or []
        if not applicable:
            filtered.append(dt)
        elif classification.value in applicable:
            filtered.append(dt)
    return filtered


# This function replaces the document type requirements for a specific school year with a new list of document type IDs, ensuring that the school year is mutable and that all provided document type IDs are valid and active. It first deletes any existing requirements for the school year and then adds new requirements based on the provided list of document type IDs.
async def replace_school_year_requirement_ids(
    db: SessionDep,
    school_year_id: UUID,
    document_type_ids: list[UUID],
) -> list[UUID]:
    requirements = await replace_school_year_requirements(
        db,
        school_year_id,
        [(document_type_id, None) for document_type_id in document_type_ids],
    )
    return [document_type_id for document_type_id, _ in requirements]

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

    # Single query: fetch ALL requirements from the source year alongside
    # each document type's current status so we can split active vs archived
    # in memory without a second round-trip.
    stmt = (
        select(
            SchoolYearRequirement.document_type_id,
            SchoolYearRequirement.extraction_schema_id,
            DocumentType.status,
        )
        .join(DocumentType, DocumentType.id == SchoolYearRequirement.document_type_id)
        .where(
            SchoolYearRequirement.school_year_id == source_school_year_id,
        )
        .order_by(desc(SchoolYearRequirement.updated_at), desc(SchoolYearRequirement.created_at))
    )
    all_source_rows = list((await db.execute(stmt)).all())

    active_ids: list[tuple[UUID, UUID | None]] = []
    for row in all_source_rows:
        if row.status == DocumentTypeStatus.ACTIVE:
            active_ids.append((row.document_type_id, row.extraction_schema_id))

    skipped = len(all_source_rows) - len(active_ids)
    if skipped:
        logger.warning(
            "Skipped %d archived document type(s) during carry-over from school year %s",
            skipped, source_school_year_id,
        )

    requirements = await replace_school_year_requirements(db, target_school_year_id, active_ids)
    return [document_type_id for document_type_id, _ in requirements]


async def get_schema_registry(db: SessionDep) -> SchemaRegistryResponse:
    doc_types_stmt = select(DocumentType).order_by(DocumentType.name)
    document_types = list((await db.execute(doc_types_stmt)).scalars().all())

    schemas_stmt = select(ExtractionSchema).order_by(ExtractionSchema.name)
    all_schemas = list((await db.execute(schemas_stmt)).scalars().all())

    requirements_stmt = (
        select(
            SchoolYearRequirement.document_type_id,
            SchoolYearRequirement.extraction_schema_id,
            SchoolYear.name,
            SchoolYear.id,
        )
        .join(SchoolYear, SchoolYear.id == SchoolYearRequirement.school_year_id)
        .order_by(SchoolYear.name)
    )
    requirement_rows = list((await db.execute(requirements_stmt)).all())

    schema_map: dict[UUID, ExtractionSchema] = {s.id: s for s in all_schemas}

    doc_type_schemas: dict[UUID, list[SchemaRegistrySchemaBrief]] = {}
    for schema in all_schemas:
        dt_id = schema.document_type_id
        if dt_id is None:
            continue
        doc_type_schemas.setdefault(dt_id, []).append(
            SchemaRegistrySchemaBrief(
                id=schema.id,
                name=schema.name,
                version_label=schema.version_label,
                status=schema.status.value,
            )
        )

    doc_type_requirements: dict[UUID, list[SchemaRegistryRequirementInfo]] = {}
    for row in requirement_rows:
        dt_id = row[0]
        es_id = row[1]
        school_year_name = row[2]
        school_year_id = row[3]
        es_name = schema_map[es_id].name if es_id and es_id in schema_map else None
        doc_type_requirements.setdefault(dt_id, []).append(
            SchemaRegistryRequirementInfo(
                school_year_id=school_year_id,
                school_year_name=school_year_name,
                extraction_schema_id=es_id,
                extraction_schema_name=es_name,
            )
        )

    entries = [
        SchemaRegistryEntry(
            document_type_id=dt.id,
            document_type_name=dt.name,
            document_type_code=dt.code,
            status=dt.status.value,
            extraction_type="structured"
            if any(s.status != ExtractionSchemaStatus.ARCHIVED.value for s in doc_type_schemas.get(dt.id, []))
            else "none",
            schemas=doc_type_schemas.get(dt.id, []),
            requirements=doc_type_requirements.get(dt.id, []),
        )
        for dt in document_types
    ]

    return SchemaRegistryResponse(entries=entries)

