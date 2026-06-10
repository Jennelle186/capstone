from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select

from ...database import SessionDep
from ...models import DocumentType, DocumentTypeStatus
from ...rbac import require_admin
from ...schemas.document_management import (
    DocumentTypeCreateRequest,
    DocumentTypeResponse,
    DocumentTypeUpdateRequest,
    RequirementAssignmentRequest,
    RequirementAssignmentResponse,
    StudentClassificationSchema,
)
from ...services.document_requirements import (
    list_school_year_requirement_ids,
    list_school_year_requirements,
    replace_school_year_requirement_ids,
    replace_school_year_requirements,
)

router = APIRouter()


def serialize_document_type(document_type: DocumentType) -> DocumentTypeResponse:
    return DocumentTypeResponse(
        id=document_type.id,
        name=document_type.name,
        code=document_type.code,
        description=document_type.description,
        classifier_description=document_type.classifier_description,
        keywords=list(document_type.keywords or []),
        applicable_classifications=[
            StudentClassificationSchema(item) for item in (document_type.applicable_classifications or [])
        ],
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
        applicable_classifications=payload.applicable_classifications,
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
    if payload.applicable_classifications is not None:
        document_type.applicable_classifications = payload.applicable_classifications
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
    requirements = await list_school_year_requirements(db, school_year_id)
    document_type_ids = [document_type_id for document_type_id, _ in requirements]

    return RequirementAssignmentResponse(
        school_year_id=school_year_id,
        document_type_ids=document_type_ids,
        requirements=[
            {
                "document_type_id": document_type_id,
                "admission_form_schema_id": admission_form_schema_id,
            }
            for document_type_id, admission_form_schema_id in requirements
        ],
    )


@router.put("/requirements", response_model=RequirementAssignmentResponse)
async def save_school_year_requirements(
    payload: RequirementAssignmentRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    if payload.requirements is not None:
        requirements = await replace_school_year_requirements(
            db,
            payload.school_year_id,
            [
                (requirement.document_type_id, requirement.admission_form_schema_id)
                for requirement in payload.requirements
            ],
        )
        document_type_ids = [document_type_id for document_type_id, _ in requirements]
    else:
        document_type_ids = await replace_school_year_requirement_ids(
            db,
            payload.school_year_id,
            payload.document_type_ids,
        )
        requirements = [(document_type_id, None) for document_type_id in document_type_ids]

    return RequirementAssignmentResponse(
        school_year_id=payload.school_year_id,
        document_type_ids=document_type_ids,
        requirements=[
            {
                "document_type_id": document_type_id,
                "admission_form_schema_id": admission_form_schema_id,
            }
            for document_type_id, admission_form_schema_id in requirements
        ],
    )
