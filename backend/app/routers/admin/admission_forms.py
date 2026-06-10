from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import desc, select

from ...database import SessionDep
from ...models import AdmissionFormSchema, AdmissionFormSchemaStatus
from ...rbac import require_admin
from ...schemas.admission_forms import (
    AdmissionFormSchemaCreateRequest,
    AdmissionFormSchemaGenerateResponse,
    AdmissionFormSchemaResponse,
    AdmissionFormSchemaUpdateRequest,
)
from ...services.llama_extract import (
    extract_data_schema,
    generate_schema_from_file,
    schema_to_editable_fields,
    upload_extract_file,
)

router = APIRouter()


def serialize_admission_form_schema(schema: AdmissionFormSchema) -> AdmissionFormSchemaResponse:
    return AdmissionFormSchemaResponse(
        id=schema.id,
        name=schema.name,
        version_label=schema.version_label,
        effective_date=schema.effective_date,
        description=schema.description,
        extraction_schema=schema.schema_json or {},
        fields_json=schema.fields_json or [],
        status=schema.status,
        source_file_name=schema.source_file_name,
        generation_prompt=schema.generation_prompt,
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


async def deactivate_other_schemas(db: SessionDep, active_schema_id: UUID | None = None) -> None:
    stmt = select(AdmissionFormSchema).where(AdmissionFormSchema.status == AdmissionFormSchemaStatus.ACTIVE)
    if active_schema_id is not None:
        stmt = stmt.where(AdmissionFormSchema.id != active_schema_id)

    active_schemas = (await db.execute(stmt)).scalars().all()
    for schema in active_schemas:
        schema.status = AdmissionFormSchemaStatus.DRAFT


@router.get("/admission-form-schemas", response_model=list[AdmissionFormSchemaResponse])
async def list_admission_form_schemas(
    status_filter: Literal["draft", "active", "archived", "all"] = Query(default="all", alias="status"),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = select(AdmissionFormSchema)
    if status_filter != "all":
        stmt = stmt.where(AdmissionFormSchema.status == AdmissionFormSchemaStatus(status_filter))

    stmt = stmt.order_by(desc(AdmissionFormSchema.updated_at), desc(AdmissionFormSchema.created_at))
    schemas = (await db.execute(stmt)).scalars().all()
    return [serialize_admission_form_schema(schema) for schema in schemas]


@router.post(
    "/admission-form-schemas",
    response_model=AdmissionFormSchemaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admission_form_schema(
    payload: AdmissionFormSchemaCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = AdmissionFormSchema(
        name=payload.name,
        version_label=payload.version_label,
        effective_date=payload.effective_date,
        description=payload.description,
        schema_json=payload.extraction_schema,
        fields_json=[field.model_dump() for field in payload.fields_json],
        status=payload.status,
        source_file_name=payload.source_file_name,
        generation_prompt=payload.generation_prompt,
    )
    db.add(schema)
    await db.flush()

    if schema.status == AdmissionFormSchemaStatus.ACTIVE:
        await deactivate_other_schemas(db, active_schema_id=schema.id)

    await db.commit()
    await db.refresh(schema)
    return serialize_admission_form_schema(schema)


@router.post("/admission-form-schemas/generate", response_model=AdmissionFormSchemaGenerateResponse)
async def generate_admission_form_schema(
    file: UploadFile = File(...),
    prompt: str | None = Form(default=None),
    current_user: dict = Depends(require_admin),
):
    del current_user

    file_obj = await upload_extract_file(file)
    file_id = file_obj.get("id")
    if not isinstance(file_id, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Llama file upload did not return a file id.",
        )

    generated_config = await generate_schema_from_file(file_id=file_id, prompt=prompt)
    data_schema = extract_data_schema(generated_config)
    fields = schema_to_editable_fields(data_schema)

    return AdmissionFormSchemaGenerateResponse(
        extraction_schema=data_schema,
        fields_json=fields,
        file_id=file_id,
        source_file_name=file.filename,
    )


@router.patch("/admission-form-schemas/{schema_id}", response_model=AdmissionFormSchemaResponse)
async def update_admission_form_schema(
    schema_id: UUID,
    payload: AdmissionFormSchemaUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = await db.get(AdmissionFormSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission form schema not found.")

    if "name" in payload.model_fields_set:
        schema.name = payload.name
    if "version_label" in payload.model_fields_set:
        schema.version_label = payload.version_label
    if "effective_date" in payload.model_fields_set:
        schema.effective_date = payload.effective_date
    if "description" in payload.model_fields_set:
        schema.description = payload.description
    if "extraction_schema" in payload.model_fields_set:
        schema.schema_json = payload.extraction_schema
    if "fields_json" in payload.model_fields_set:
        schema.fields_json = [field.model_dump() for field in payload.fields_json]
    if "status" in payload.model_fields_set:
        schema.status = payload.status
    if "source_file_name" in payload.model_fields_set:
        schema.source_file_name = payload.source_file_name
    if "generation_prompt" in payload.model_fields_set:
        schema.generation_prompt = payload.generation_prompt

    if schema.status == AdmissionFormSchemaStatus.ACTIVE:
        await deactivate_other_schemas(db, active_schema_id=schema.id)

    await db.commit()
    await db.refresh(schema)
    return serialize_admission_form_schema(schema)


@router.post("/admission-form-schemas/{schema_id}/activate", response_model=AdmissionFormSchemaResponse)
async def activate_admission_form_schema(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = await db.get(AdmissionFormSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission form schema not found.")

    await deactivate_other_schemas(db, active_schema_id=schema.id)
    schema.status = AdmissionFormSchemaStatus.ACTIVE
    await db.commit()
    await db.refresh(schema)
    return serialize_admission_form_schema(schema)
