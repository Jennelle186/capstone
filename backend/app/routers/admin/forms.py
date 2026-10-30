from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload

from ...database import SessionDep
from ...models import (
    BrandingSettings,
    ExtractionSchema,
    ExtractionSchemaStatus,
    Form,
    User,
)
from ...rbac import require_admin
from ...schemas.extraction_schemas import ExtractionSchemaField
from ...schemas.form_layout import validate_persistable
from ...schemas.forms import (
    DraftSchemaResponse,
    FormCreate,
    FormGenerateRequest,
    FormGenerateResponse,
    FormResponse,
    FormUpdate,
    SyncSchemaResponse,
)
from ...services.concurrency import BLUEPRINT_SEMAPHORE
from ...services.form_document import (
    blueprint_to_document,
    document_to_fields,
    ground_field_keys,
    normalize_field_key,
)
from ...services.form_docx import render_form_docx, sanitize_filename
from ...services.form_schema_lifecycle import (
    create_draft_schema_from_form,
    diff_and_merge_schema_fields,
)
from ...services.gcp_pipeline import (
    GcpPipelineError,
    generate_form_blueprint,
    generate_form_layout,
)
from ...services.gcp_storage import download_file_bytes

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
        extraction_schema_id=form.extraction_schema_id,
        extraction_schema_name=form.extraction_schema.name if form.extraction_schema else None,
        document_json=form.document_json or {},
        pdf_file_key=form.pdf_file_key,
        created_at=form.created_at,
        updated_at=form.updated_at,
    )


async def _resolve_schema_for_form(
    db: SessionDep,
    schema_id: UUID,
    document_type_id: UUID | None,
) -> ExtractionSchema:
    """Validate a form→schema provenance link: the schema must exist, be
    non-archived, and its document type must be null or match the form's."""
    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extraction schema not found.",
        )
    if schema.status == ExtractionSchemaStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived extraction schemas cannot be linked to a form.",
        )
    if schema.document_type_id is not None and document_type_id is not None:
        if schema.document_type_id != document_type_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The extraction schema's document type does not match the form's document type.",
            )
    return schema


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

    stmt = (
        select(Form)
        .options(selectinload(Form.extraction_schema))
        .order_by(desc(Form.updated_at), desc(Form.created_at))
    )
    forms = (await db.execute(stmt)).scalars().all()
    return [serialize_form(f) for f in forms]


@router.get("/forms/{form_id}", response_model=FormResponse)
async def get_form(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    form = (
        await db.execute(
            select(Form)
            .options(selectinload(Form.extraction_schema))
            .where(Form.id == form_id)
        )
    ).scalar_one_or_none()
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

    if payload.extraction_schema_id is not None:
        await _resolve_schema_for_form(db, payload.extraction_schema_id, payload.document_type_id)

    form = Form(
        name=payload.name,
        description=payload.description,
        creation_mode=payload.creation_mode,
        document_type_id=payload.document_type_id,
        extraction_schema_id=payload.extraction_schema_id,
        document_json=document_json,
        created_by=creator_id,
    )
    db.add(form)
    await db.commit()
    form = (
        await db.execute(
            select(Form)
            .options(selectinload(Form.extraction_schema))
            .where(Form.id == form.id)
        )
    ).scalar_one()
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

    form = (
        await db.execute(
            select(Form)
            .options(selectinload(Form.extraction_schema))
            .where(Form.id == form_id)
        )
    ).scalar_one_or_none()
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

    if "extraction_schema_id" in payload.model_fields_set:
        form.extraction_schema_id = payload.extraction_schema_id

    # Re-validate the final provenance link against the final document type,
    # covering both "schema changed" and "document type changed" paths.
    if form.extraction_schema_id is not None:
        await _resolve_schema_for_form(db, form.extraction_schema_id, form.document_type_id)

    await db.commit()
    form = (
        await db.execute(
            select(Form)
            .options(selectinload(Form.extraction_schema))
            .where(Form.id == form.id)
        )
    ).scalar_one()
    return serialize_form(form)


@router.post("/forms/{form_id}/draft-schema", response_model=DraftSchemaResponse)
async def draft_schema_from_form(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Create a draft extraction schema from the form's field blocks and link
    it back to the form (provenance)."""
    del current_user

    form = await db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")

    if form.extraction_schema_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This form already has a linked extraction schema. Sync it instead.",
        )

    schema = await create_draft_schema_from_form(db, form)
    return DraftSchemaResponse(schema_id=schema.id, form_id=form.id, schema_name=schema.name)


@router.post("/forms/{form_id}/sync-schema", response_model=SyncSchemaResponse)
async def sync_form_schema(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Sync the form's field keys into its linked extraction schema, preserving
    analytics metadata and blocking dependency-referenced removals."""
    del current_user

    form = (
        await db.execute(
            select(Form)
            .options(selectinload(Form.extraction_schema))
            .where(Form.id == form_id)
        )
    ).scalar_one_or_none()
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")

    schema = form.extraction_schema
    if schema is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This form has no linked extraction schema. Create a draft schema first.",
        )

    form_fields = document_to_fields(form.document_json or {})
    result = diff_and_merge_schema_fields(form_fields, schema.fields_json or [])
    schema.fields_json = result["fields"]
    await db.commit()

    return SyncSchemaResponse(
        added=result["added"],
        updated=result["updated"],
        removed=result["removed"],
        blocked_removals=result["blocked_removals"],
    )


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


@router.get("/forms/{form_id}/export.docx")
async def export_form_docx(
    form_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Download a form as a blank Word ``.docx`` (fields as write-on lines)."""
    del current_user

    form = await db.get(Form, form_id)
    if form is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Form not found.")

    branding_data: dict | None = None
    logo_bytes: bytes | None = None
    branding = await db.get(BrandingSettings, 1)
    if branding is not None:
        branding_data = {
            "institution_name": branding.institution_name,
            "address_lines": branding.address_lines or [],
            "contact_line": branding.contact_line,
        }
        if branding.logo_file_key:
            try:
                logo_bytes = await asyncio.to_thread(download_file_bytes, branding.logo_file_key)
            except Exception:
                logger.warning("Failed to download branding logo for .docx export; exporting without logo")

    docx_bytes = render_form_docx(
        form.document_json or {},
        logo_bytes=logo_bytes,
        branding=branding_data,
    )
    filename = sanitize_filename(form.name)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
    )
