from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import desc, select, update

from ...database import SessionDep
from ...models import DocumentType, ExtractionSchema, ExtractionSchemaStatus, Form as FormModel
from ...rbac import require_admin
from ...schemas.extraction_schemas import (
    ExtractionSchemaCreateRequest,
    ExtractionSchemaField,
    ExtractionSchemaGenerateResponse,
    ExtractionSchemaResponse,
    ExtractionSchemaUpdateRequest,
)
from ...schemas.forms import FormResponse
from ...services.analytics_inheritance import (
    inherit_analytics_from_previous,
    validate_analytics_fields,
)
from ...services.activity_log import diff_values, plain, record_activity
from ...services.concurrency import BLUEPRINT_SEMAPHORE
from ...services.form_document import schema_to_document
from ...services.gcp_pipeline import (
    GcpPipelineError,
    classify_document,
    generate_schema_blueprint,
)
from ...services.gcp_storage import (
    _admin_temp_prefix,
    delete_file,
    upload_file_bytes,
)
from ...services.schema_generation import blueprint_to_fields
from .forms import resolve_creator_id, serialize_form

logger = logging.getLogger(__name__)

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


def _json_digest(name: str, value: object) -> dict:
    """Digest and size of a JSON body. Edits are still detected, without copying the body into every audit row."""
    raw = json.dumps(value, sort_keys=True, default=str).encode("utf-8")
    return {f"{name}_sha256": hashlib.sha256(raw).hexdigest(), f"{name}_bytes": len(raw)}


def _schema_snapshot(schema: ExtractionSchema) -> dict:
    """Activity-log view of a schema: metadata plus digests of schema_json and fields_json,
    so any edit to the schema or its fields produces an audit entry."""
    return {
        "name": schema.name,
        "version_label": schema.version_label,
        "effective_date": schema.effective_date,
        "description": schema.description,
        "document_type_id": schema.document_type_id,
        "status": schema.status,
        "source_file_name": schema.source_file_name,
        "generation_prompt": schema.generation_prompt,
        **_json_digest("schema_json", schema.schema_json or {}),
        **_json_digest("fields_json", schema.fields_json or []),
    }


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
    if payload.status == ExtractionSchemaStatus.ACTIVE:
        validation_errors = validate_analytics_fields([f.model_dump() for f in payload.fields_json])
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Analytics validation failed: " + " ".join(validation_errors),
            )

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

    if payload.document_type_id:
        dt_exists = await db.get(DocumentType, payload.document_type_id)
        if dt_exists is None:
            raise HTTPException(status_code=404, detail="Document type not found.")

    db.add(schema)
    await db.flush()
    await record_activity(
        db,
        current_user,
        action="create",
        entity_type="extraction_schema",
        entity_id=schema.id,
        entity_label=schema.name,
        new_values=plain(_schema_snapshot(schema)),
    )

    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)


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

        schema_json, fields = blueprint_to_fields(blueprint, source_file_name=source_file_name)

        if matched_document_type_id:
            fields = await inherit_analytics_from_previous(db, matched_document_type_id, fields)

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
    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

    before_values = plain(_schema_snapshot(schema))

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
        if payload.document_type_id:
            dt_exists = await db.get(DocumentType, payload.document_type_id)
            if dt_exists is None:
                raise HTTPException(status_code=404, detail="Document type not found.")
        schema.document_type_id = payload.document_type_id
    previous_status = schema.status
    if "status" in payload.model_fields_set:
        schema.status = payload.status
    if "source_file_name" in payload.model_fields_set:
        schema.source_file_name = payload.source_file_name
    if "generation_prompt" in payload.model_fields_set:
        schema.generation_prompt = payload.generation_prompt

    if schema.status == ExtractionSchemaStatus.ACTIVE:
        validation_errors = validate_analytics_fields(schema.fields_json or [])
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Analytics validation failed: " + " ".join(validation_errors),
            )
        if previous_status != ExtractionSchemaStatus.ACTIVE:
            # Same rule as /activate: only one active schema per document type.
            await _demote_other_active_schemas(db, schema, current_user)

    previous_values, new_values = diff_values(before_values, plain(_schema_snapshot(schema)))
    if previous_values:
        await record_activity(
            db,
            current_user,
            action="update",
            entity_type="extraction_schema",
            entity_id=schema.id,
            entity_label=schema.name,
            previous_values=previous_values,
            new_values=new_values,
        )

    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)


async def _demote_other_active_schemas(db: SessionDep, schema: ExtractionSchema, current_user: dict) -> int:
    """Set every other active schema for the same document type to draft, one audit entry each.

    Does not commit; the caller commits with its own audit rows. Returns the number demoted.
    """
    # Load the schemas that will be demoted first, so each one gets its own audit entry.
    currently_active = (
        await db.execute(
            select(ExtractionSchema.id, ExtractionSchema.name).where(
                ExtractionSchema.status == ExtractionSchemaStatus.ACTIVE,
                ExtractionSchema.document_type_id == schema.document_type_id,
                ExtractionSchema.id != schema.id,
            )
        )
    ).all()
    await db.execute(
        update(ExtractionSchema)
        .where(
            ExtractionSchema.status == ExtractionSchemaStatus.ACTIVE,
            ExtractionSchema.document_type_id == schema.document_type_id,
            ExtractionSchema.id != schema.id,
        )
        .values(status=ExtractionSchemaStatus.DRAFT)
    )
    for demoted_id, demoted_name in currently_active:
        await record_activity(
            db,
            current_user,
            action="deactivate",
            entity_type="extraction_schema",
            entity_id=demoted_id,
            entity_label=demoted_name,
            previous_values={"status": ExtractionSchemaStatus.ACTIVE.value},
            new_values={"status": ExtractionSchemaStatus.DRAFT.value},
            extra_metadata={"replaced_by_schema_id": str(schema.id)},
        )
    return len(currently_active)


@router.post("/extraction-schemas/{schema_id}/activate", response_model=ExtractionSchemaResponse)
async def activate_extraction_schema(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

    validation_errors = validate_analytics_fields(schema.fields_json or [])
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analytics validation failed: " + " ".join(validation_errors),
        )

    previous_status = plain(schema.status)
    demoted_count = await _demote_other_active_schemas(db, schema, current_user)
    schema.status = ExtractionSchemaStatus.ACTIVE
    await record_activity(
        db,
        current_user,
        action="activate",
        entity_type="extraction_schema",
        entity_id=schema.id,
        entity_label=schema.name,
        previous_values={"status": previous_status},
        new_values={"status": ExtractionSchemaStatus.ACTIVE.value},
        extra_metadata={"previous_active_demoted": demoted_count},
    )
    await db.commit()
    await db.refresh(schema)
    return serialize_extraction_schema(schema)


@router.post(
    "/extraction-schemas/{schema_id}/create-form",
    response_model=FormResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_form_from_schema(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Materialize a linked ``Form`` from an existing extraction schema.

    For legacy schemas that predate the form feature (scenario C). The form
    inherits the schema's document type; multiple forms may share a schema.
    """
    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")

    document_json = schema_to_document(schema)
    creator_id = await resolve_creator_id(db, current_user)

    form = FormModel(
        name=schema.name,
        description=schema.description,
        creation_mode="structured",
        document_json=document_json,
        extraction_schema_id=schema.id,
        document_type_id=schema.document_type_id,
        created_by=creator_id,
    )
    db.add(form)
    await db.flush()
    await record_activity(
        db,
        current_user,
        action="create",
        entity_type="form",
        entity_id=form.id,
        entity_label=form.name,
        new_values={
            "name": form.name,
            "creation_mode": "structured",
            "extraction_schema_id": str(schema.id),
            "document_type_id": str(schema.document_type_id) if schema.document_type_id else None,
        },
    )
    await db.commit()
    await db.refresh(form)
    return serialize_form(form)
