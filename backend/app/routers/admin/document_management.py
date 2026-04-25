from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, desc, func, select

from ...database import SessionDep
from ...models import DocumentType, DocumentTypeStatus, SchoolYearRequirement
from ...rbac import require_admin
from ...schemas.document_management import (
    DocumentTypeCreateRequest,
    DocumentTypeResponse,
    DocumentTypeUpdateRequest,
    RequirementAssignmentRequest,
    RequirementAssignmentResponse,
)
from ...services.document_requirements import ensure_school_year_requirements_mutable, get_school_year_or_404

router = APIRouter()


def serialize_document_type(document_type: DocumentType) -> DocumentTypeResponse:
    return DocumentTypeResponse(
        id=document_type.id,
        name=document_type.name,
        code=document_type.code,
        description=document_type.description,
        classifier_description=document_type.classifier_description,
        keywords=list(document_type.keywords or []),
        status=document_type.status,
        created_at=document_type.created_at,
        updated_at=document_type.updated_at,
    )


async def ensure_unique_document_type_code(
    db: SessionDep,
    code: str,
    exclude_id: UUID | None = None,
) -> None:
    stmt = select(DocumentType).where(func.lower(DocumentType.code) == code.lower())
    if exclude_id is not None:
        stmt = stmt.where(DocumentType.id != exclude_id)

    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Document type code "{code}" already exists.',
        )


@router.get("/document-types", response_model=list[DocumentTypeResponse])
async def list_document_types(
    status_filter: Literal["active", "archived", "all"] = Query(default="all", alias="status"),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = select(DocumentType)
    if status_filter != "all":
        stmt = stmt.where(DocumentType.status == DocumentTypeStatus(status_filter))

    stmt = stmt.order_by(desc(DocumentType.updated_at), desc(DocumentType.created_at))
    document_types = (await db.execute(stmt)).scalars().all()
    return [serialize_document_type(document_type) for document_type in document_types]


@router.post("/document-types", response_model=DocumentTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_document_type(
    payload: DocumentTypeCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    await ensure_unique_document_type_code(db, payload.code)

    document_type = DocumentType(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        classifier_description=payload.classifier_description,
        keywords=payload.keywords,
        status=payload.status,
    )
    db.add(document_type)
    await db.commit()
    await db.refresh(document_type)
    return serialize_document_type(document_type)


@router.patch("/document-types/{document_type_id}", response_model=DocumentTypeResponse)
async def update_document_type(
    document_type_id: UUID,
    payload: DocumentTypeUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    document_type = await db.get(DocumentType, document_type_id)
    if document_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document type not found.")

    if payload.code is not None and payload.code != document_type.code:
        await ensure_unique_document_type_code(db, payload.code, exclude_id=document_type.id)
        document_type.code = payload.code

    if payload.name is not None:
        document_type.name = payload.name
    if payload.description is not None:
        document_type.description = payload.description
    if payload.classifier_description is not None:
        document_type.classifier_description = payload.classifier_description
    if payload.keywords is not None:
        document_type.keywords = payload.keywords
    if payload.status is not None:
        document_type.status = payload.status

    await db.commit()
    await db.refresh(document_type)
    return serialize_document_type(document_type)


@router.get("/requirements", response_model=RequirementAssignmentResponse)
async def get_school_year_requirements(
    school_year_id: UUID = Query(...),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    await get_school_year_or_404(db, school_year_id)

    stmt = (
        select(SchoolYearRequirement.document_type_id)
        .where(SchoolYearRequirement.school_year_id == school_year_id)
        .order_by(desc(SchoolYearRequirement.updated_at), desc(SchoolYearRequirement.created_at))
    )
    document_type_ids = list((await db.execute(stmt)).scalars().all())

    return RequirementAssignmentResponse(
        school_year_id=school_year_id,
        document_type_ids=document_type_ids,
    )


@router.put("/requirements", response_model=RequirementAssignmentResponse)
async def replace_school_year_requirements(
    payload: RequirementAssignmentRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    await ensure_school_year_requirements_mutable(db, payload.school_year_id)

    if payload.document_type_ids:
        existing_stmt = select(DocumentType.id).where(
            DocumentType.id.in_(payload.document_type_ids),
            DocumentType.status == DocumentTypeStatus.ACTIVE,
        )
        existing_ids = set((await db.execute(existing_stmt)).scalars().all())
        missing_or_inactive = [doc_id for doc_id in payload.document_type_ids if doc_id not in existing_ids]
        if missing_or_inactive:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more document types are missing or not active.",
            )

    await db.execute(
        delete(SchoolYearRequirement).where(SchoolYearRequirement.school_year_id == payload.school_year_id)
    )

    for document_type_id in payload.document_type_ids:
        db.add(
            SchoolYearRequirement(
                school_year_id=payload.school_year_id,
                document_type_id=document_type_id,
            )
        )

    await db.commit()
    return RequirementAssignmentResponse(
        school_year_id=payload.school_year_id,
        document_type_ids=payload.document_type_ids,
    )
