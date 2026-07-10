from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

logger = logging.getLogger(__name__)
from sqlalchemy import desc, select, update

from ...database import SessionDep
from ...models import DocumentType, ExtractionSchema, ExtractionSchemaStatus
from ...rbac import require_admin
from ...services.concurrency import BLUEPRINT_SEMAPHORE
from ...schemas.extraction_schemas import (
    ExtractionSchemaCreateRequest,
    ExtractionSchemaField,
    ExtractionSchemaGenerateResponse,
    ExtractionSchemaResponse,
    ExtractionSchemaUpdateRequest,
    FieldOption,
)
from ...services.gcp_pipeline import GcpPipelineError, classify_document, generate_schema_blueprint
from ...services.gcp_storage import _admin_temp_prefix, delete_file, upload_file_bytes

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


def _blueprint_to_fields(
    blueprint: dict[str, Any],
    source_file_name: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Convert an AdminSchemaBlueprint into schema_json + flat fields_json.

    The schema_json stores the full blueprint for the frontend tree renderer.
    fields_json is a flat list of ExtractionSchemaFields with hierarchy/options
    preserved as optional attributes.
    """
    sections = blueprint.get("sections", [])
    fields: list[dict[str, Any]] = []
    auto_id = 0

    for section in sections:
        section_id = section.get("section_id", f"section_{auto_id}")
        section_title = section.get("section_title", "")
        for bf in section.get("fields", []):
            field_id = bf.get("field_id", f"field_{auto_id}")
            label = bf.get("label", "")
            data_type = bf.get("data_type", "string")
            mapped_type = data_type if data_type in ("string", "number", "integer", "boolean", "select", "multi-select") else "string"
            ui_component = bf.get("ui_component", "text_input")
            hierarchy_level = bf.get("hierarchy_level", 1)
            parent_field_id = bf.get("parent_field_id")
            raw_options = bf.get("options")
            options = []
            if isinstance(raw_options, list):
                for opt in raw_options:
                    if isinstance(opt, dict):
                        options.append(
                            FieldOption(
                                value=str(opt.get("value", "")),
                                label=str(opt.get("label", "")),
                            )
                        )
                if mapped_type == "string" and len(options) > 0:
                    mapped_type = "multi-select" if ui_component == "checkbox_group" else "select"

            fields.append({
                "id": f"gen_{auto_id}_{field_id}",
                "key": field_id,
                "type": mapped_type,
                "description": label,
                "required": bf.get("required", False),
                "ui_component": ui_component,
                "hierarchy_level": hierarchy_level,
                "parent_field_id": parent_field_id,
                "options": [o.model_dump() for o in options] if options else None,
                "section_id": section_id,
                "section_title": section_title,
                "is_analytics": False,
            })
            auto_id += 1

    schema_json: dict[str, Any] = {
        "type": "AdminSchemaBlueprint",
        "form_name": blueprint.get("form_name", ""),
        "form_control_id": blueprint.get("form_control_id", ""),
        "sections": blueprint.get("sections", []),
        "source_file_name": source_file_name,
    }

    return schema_json, fields


@router.post("/extraction-schemas/generate", response_model=ExtractionSchemaGenerateResponse)
async def generate_extraction_schema(
    files: list[UploadFile] | None = File(default=None),
    prompt: str | None = Form(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    temp_key: str | None = None
    source_file_name: str | None = None

    if files:
        first_file = files[0]
        content = await first_file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        import uuid
        temp_key = f"{_admin_temp_prefix()}{uuid.uuid4().hex}/{first_file.filename or 'upload.pdf'}"
        source_file_name = first_file.filename
        upload_file_bytes(temp_key, content)

    try:
        # Classify the document to match an exact document type from DB
        matched_document_type_id: UUID | None = None
        if temp_key:
            try:
                doc_types_raw = (await db.execute(select(DocumentType))).scalars().all()
                classification = await asyncio.to_thread(classify_document, temp_key, doc_types_raw)
                matched_type_code = classification.get("match", {}).get("type")
                if matched_type_code:
                    matched_dt = next(
                        (dt for dt in doc_types_raw if dt.code == matched_type_code),
                        None,
                    )
                    if matched_dt:
                        matched_document_type_id = matched_dt.id
            except Exception:
                logger.warning("Document classification failed during schema generation", exc_info=True)

        async with BLUEPRINT_SEMAPHORE:
            blueprint = await asyncio.to_thread(
                generate_schema_blueprint, file_key=temp_key, description=prompt
            )

        schema_json, fields = _blueprint_to_fields(blueprint, source_file_name=source_file_name)

        return ExtractionSchemaGenerateResponse(
            extraction_schema=schema_json,
            fields_json=[ExtractionSchemaField(**f) for f in fields],
            file_id=temp_key or "",
            source_file_name=source_file_name,
            document_type_id=matched_document_type_id,
            effective_date=blueprint.get("effective_date") or None,
        )
    except GcpPipelineError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Schema generation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schema generation failed: {exc}",
        )
    finally:
        if temp_key:
            try:
                await asyncio.to_thread(delete_file, temp_key)
            except Exception:
                pass


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

    await db.execute(
        update(ExtractionSchema)
        .where(
            ExtractionSchema.status == ExtractionSchemaStatus.ACTIVE,
            ExtractionSchema.document_type_id == schema.document_type_id,
        )
        .values(status=ExtractionSchemaStatus.DRAFT)
    )
    schema.status = ExtractionSchemaStatus.ACTIVE
    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)
