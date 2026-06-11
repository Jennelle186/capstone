from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import desc, select

from ...database import SessionDep
from ...models import ExtractionSchema, ExtractionSchemaStatus
from ...rbac import require_admin
from ...schemas.extraction_schemas import (
    ExtractionSchemaCreateRequest,
    ExtractionSchemaGenerateResponse,
    ExtractionSchemaResponse,
    ExtractionSchemaUpdateRequest,
)
from ...services.llama_extract import (
    extract_data_schema,
    generate_schema_from_file,
    schema_to_editable_fields,
    upload_extract_file,
)

router = APIRouter()


def serialize_extraction_schema(schema: ExtractionSchema) -> ExtractionSchemaResponse:
    return ExtractionSchemaResponse(
        id=schema.id,
        name=schema.name,
        version_label=schema.version_label,
        effective_date=schema.effective_date,
        description=schema.description,
        extraction_schema=schema.schema_json or {},
        fields_json=schema.fields_json or [],
        document_type_id=schema.document_type_id,
        status=schema.status,
        source_file_name=schema.source_file_name,
        generation_prompt=schema.generation_prompt,
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


@router.get("/extraction-schemas", response_model=list[ExtractionSchemaResponse])
async def list_extraction_schemas(
    status_filter: Literal["draft", "active", "archived", "all"] = Query(default="all", alias="status"),
    document_type_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    stmt = select(ExtractionSchema)
    if status_filter != "all":
        stmt = stmt.where(ExtractionSchema.status == ExtractionSchemaStatus(status_filter))
    if document_type_id is not None:
        stmt = stmt.where(ExtractionSchema.document_type_id == document_type_id)

    stmt = stmt.order_by(desc(ExtractionSchema.updated_at), desc(ExtractionSchema.created_at))
    schemas = (await db.execute(stmt)).scalars().all()
    return [serialize_extraction_schema(schema) for schema in schemas]


@router.get("/extraction-schemas/{schema_id}", response_model=ExtractionSchemaResponse)
async def get_extraction_schema(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

    return serialize_extraction_schema(schema)


@router.post(
    "/extraction-schemas",
    response_model=ExtractionSchemaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_extraction_schema(
    payload: ExtractionSchemaCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = ExtractionSchema(
        name=payload.name,
        version_label=payload.version_label,
        effective_date=payload.effective_date,
        description=payload.description,
        schema_json=payload.extraction_schema,
        fields_json=[field.model_dump() for field in payload.fields_json],
        document_type_id=payload.document_type_id,
        status=payload.status,
        source_file_name=payload.source_file_name,
        generation_prompt=payload.generation_prompt,
    )
    db.add(schema)
    await db.flush()

    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)


@router.post("/extraction-schemas/generate", response_model=ExtractionSchemaGenerateResponse)
async def generate_extraction_schema(
    files: list[UploadFile] = File(...),
    prompt: str | None = Form(default=None),
    current_user: dict = Depends(require_admin),
):
    del current_user

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file is required.",
        )

    first_file = files[0]
    file_obj = await upload_extract_file(first_file)
    file_id = file_obj.get("id")
    if not isinstance(file_id, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Llama file upload did not return a file id.",
        )

    generated_config = await generate_schema_from_file(file_id=file_id, prompt=prompt)
    data_schema = extract_data_schema(generated_config)
    fields = schema_to_editable_fields(data_schema)

    return ExtractionSchemaGenerateResponse(
        extraction_schema=data_schema,
        fields_json=fields,
        file_id=file_id,
        source_file_name=first_file.filename,
    )


@router.patch("/extraction-schemas/{schema_id}", response_model=ExtractionSchemaResponse)
async def update_extraction_schema(
    schema_id: UUID,
    payload: ExtractionSchemaUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

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
    if "document_type_id" in payload.model_fields_set:
        schema.document_type_id = payload.document_type_id
    if "status" in payload.model_fields_set:
        schema.status = payload.status
    if "source_file_name" in payload.model_fields_set:
        schema.source_file_name = payload.source_file_name
    if "generation_prompt" in payload.model_fields_set:
        schema.generation_prompt = payload.generation_prompt

    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)


@router.post("/extraction-schemas/{schema_id}/activate", response_model=ExtractionSchemaResponse)
async def activate_extraction_schema(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

    schema.status = ExtractionSchemaStatus.ACTIVE
    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)
