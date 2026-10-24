from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import desc, select

from ...database import SessionDep
from ...models import Form, User
from ...rbac import require_admin
from ...schemas.extraction_schemas import ExtractionSchemaField
from ...schemas.forms import (
    FormCreate,
    FormGenerateRequest,
    FormGenerateResponse,
    FormResponse,
    FormUpdate,
)
from ...services.concurrency import BLUEPRINT_SEMAPHORE
from ...services.form_document import blueprint_to_document, document_to_fields, ground_field_keys, normalize_field_key
from ...services.gcp_pipeline import GcpPipelineError, generate_form_blueprint, generate_form_layout
from ...schemas.form_layout import validate_persistable

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_document(document_json: Any) -> dict:
    """Validate and normalize ``document_json`` before persisting.

    Raises 422 for a structurally invalid document or one containing unresolved
    field blocks (the save = approval gate).
    """
    try:
        return validate_persistable(document_json).model_dump()
    except (ValidationError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid form document: {exc}",
        ) from exc


def serialize_form(form: Form) -> FormResponse:
    return FormResponse(
        id=form.id,
        name=form.name,
        description=form.description,
        creation_mode=form.creation_mode,
        document_type_id=form.document_type_id,
        document_json=form.document_json or {},
        pdf_file_key=form.pdf_file_key,
        extraction_schema_id=form.extraction_schema_id,
        created_at=form.created_at,
        updated_at=form.updated_at,
    )


async def resolve_creator_id(db: SessionDep, current_user: dict) -> UUID | None:
    sub = current_user.get("sub")
    if not isinstance(sub, str) or not sub:
        return None
    result = await db.execute(select(User.id).where(User.clerk_user_id == sub))
    return result.scalar_one_or_none()


@router.get("/forms", response_model=list[FormResponse])
async def list_forms(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = select(Form).order_by(desc(Form.updated_at), desc(Form.created_at))
    forms = (await db.execute(stmt)).scalars().all()
    return [serialize_form(f) for f in forms]


@router.get("/forms/{form_id}", response_model=FormResponse)
async def get_form(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    form = await db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")
    return serialize_form(form)


@router.post(
    "/forms",
    response_model=FormResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_form(
    payload: FormCreate,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    creator_id = await resolve_creator_id(db, current_user)
    document_json = _validate_document(payload.document_json)
    form = Form(
        name=payload.name,
        description=payload.description,
        creation_mode=payload.creation_mode,
        document_type_id=payload.document_type_id,
        document_json=document_json,
        created_by=creator_id,
    )
    db.add(form)
    await db.commit()
    await db.refresh(form)
    return serialize_form(form)


@router.post("/forms/generate", response_model=FormGenerateResponse)
async def generate_form(
    payload: FormGenerateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    del db

    try:
        async with BLUEPRINT_SEMAPHORE:
            if payload.fields is not None:
                raw_fields = [f.model_dump() for f in payload.fields]
                blueprint = await asyncio.to_thread(generate_form_layout, raw_fields, payload.description)
            else:
                blueprint = await asyncio.to_thread(generate_form_blueprint, payload.description)
    except GcpPipelineError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        logger.exception("Form generation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form generation failed: {exc}",
        )

    document_json = blueprint_to_document(blueprint)
    warnings: list[str] = []
    if payload.fields is not None:
        valid_keys = {normalize_field_key(f.key) for f in payload.fields}
        document_json, warnings = ground_field_keys(document_json, valid_keys)
        fields_json = payload.fields
    else:
        fields_json = [ExtractionSchemaField(**f) for f in document_to_fields(document_json)]

    return FormGenerateResponse(
        document_json=document_json,
        fields_json=fields_json,
        form_name=blueprint.get("form_name", ""),
        form_control_id=blueprint.get("form_control_id", ""),
        warnings=warnings,
    )


@router.patch("/forms/{form_id}", response_model=FormResponse)
async def update_form(
    form_id: UUID,
    payload: FormUpdate,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    form = await db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")

    if "name" in payload.model_fields_set:
        form.name = payload.name
    if "description" in payload.model_fields_set:
        form.description = payload.description
    if "creation_mode" in payload.model_fields_set and payload.creation_mode is not None:
        form.creation_mode = payload.creation_mode
    if "document_type_id" in payload.model_fields_set:
        form.document_type_id = payload.document_type_id
    if "document_json" in payload.model_fields_set:
        form.document_json = _validate_document(payload.document_json)

    await db.commit()
    await db.refresh(form)
    return serialize_form(form)


@router.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_form(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    form = await db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")

    await db.delete(form)
    await db.commit()
    return None
