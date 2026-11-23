from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
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
    ExtractionSchemaSampleUrlResponse,
    ExtractionSchemaUpdateRequest,
    SampleCleanupRequest,
    SampleCleanupResponse,
    SampleDiscardRequest,
    SampleDiscardResponse,
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
    _admin_sample_prefix,
    admin_sample_key,
    blob_exists,
    delete_file,
    delete_file_batch,
    delete_file_checked,
    generate_presigned_url,
    is_admin_sample_key,
    list_blob_times,
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
        has_sample=bool(schema.sample_file_key),
        sample_content_type=schema.sample_content_type,
        created_at=schema.created_at,
        updated_at=schema.updated_at,
    )


# The only file types an admin may keep as a sample. The type comes from the extension, never from the upload's header.
_SAMPLE_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def _sample_content_type(filename: str | None) -> str | None:
    """Content type for an allowed sample filename, or None when the type is not allowed."""
    return _SAMPLE_CONTENT_TYPES.get(Path(filename or "").suffix.lower())


async def _sample_in_use(db, key: str, exclude_schema_id: UUID | None = None) -> bool:
    """True when a saved schema (other than exclude_schema_id) points at this sample key."""
    stmt = select(ExtractionSchema.id).where(ExtractionSchema.sample_file_key == key)
    if exclude_schema_id is not None:
        stmt = stmt.where(ExtractionSchema.id != exclude_schema_id)
    return (await db.execute(stmt.limit(1))).first() is not None


def _content_type_for(key: str) -> str:
    """Content type of a stored sample, from its key's extension."""
    return _sample_content_type(key) or "application/pdf"


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


SAMPLE_URL_EXPIRES_IN = 900


@router.get("/extraction-schemas/{schema_id}/sample-url", response_model=ExtractionSchemaSampleUrlResponse)
async def get_extraction_schema_sample_url(
    schema_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Short-lived link to the blank sample form this schema was generated from."""
    del current_user

    schema = await db.get(ExtractionSchema, schema_id)
    if schema is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction schema not found.")
    if not is_admin_sample_key(schema.sample_file_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No sample is saved for this schema.")

    # The file can be removed by the cleanup, so check it is still there before giving out a link to it.
    if not await asyncio.to_thread(blob_exists, schema.sample_file_key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The sample file is no longer stored. Generate the schema again to add a new sample.",
        )

    url = await asyncio.to_thread(generate_presigned_url, schema.sample_file_key, SAMPLE_URL_EXPIRES_IN)
    return ExtractionSchemaSampleUrlResponse(url=url, expires_in=SAMPLE_URL_EXPIRES_IN)


@router.post("/extraction-schemas/samples/discard", response_model=SampleDiscardResponse)
async def discard_unsaved_sample(
    payload: SampleDiscardRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Delete a generated sample that no saved schema uses. A sample a schema still points at is never deleted."""
    del current_user

    if not is_admin_sample_key(payload.file_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a sample upload.")

    if await _sample_in_use(db, payload.file_id):
        return SampleDiscardResponse(deleted=False)

    try:
        deleted = await asyncio.to_thread(delete_file_checked, payload.file_id)
    except Exception:
        logger.warning("Could not delete unused sample %s", payload.file_id, exc_info=True)
        return SampleDiscardResponse(deleted=False)
    return SampleDiscardResponse(deleted=deleted)


@router.post("/extraction-schemas/samples/cleanup", response_model=SampleCleanupResponse)
async def cleanup_unused_samples(
    payload: SampleCleanupRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """List, and when dry_run is false delete, sample files that no schema refers to.

    Defaults to a dry run, so nothing is deleted unless the admin asks for it. Samples uploaded more recently
    than min_age_minutes are left alone, since they may belong to a generation that has not been saved yet.
    """
    del current_user

    ages = await asyncio.to_thread(list_blob_times, _admin_sample_prefix())
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=payload.min_age_minutes)
    stored = [key for key, created in ages.items() if created is not None and created <= cutoff]
    referenced = set(
        (
            await db.execute(
                select(ExtractionSchema.sample_file_key).where(ExtractionSchema.sample_file_key.isnot(None))
            )
        )
        .scalars()
        .all()
    )
    orphaned = [key for key in stored if key not in referenced]

    # Delete only what the admin saw and confirmed, so the number in the dialog matches what is removed.
    to_delete = orphaned
    if payload.confirmed_keys is not None:
        confirmed = set(payload.confirmed_keys)
        to_delete = [key for key in orphaned if key in confirmed]

    failed: list[str] = []
    if to_delete and not payload.dry_run:
        failed = await asyncio.to_thread(delete_file_batch, to_delete)

    return SampleCleanupResponse(
        dry_run=payload.dry_run,
        scanned=len(ages),
        orphaned_count=len(orphaned),
        deleted_count=0 if payload.dry_run else len(to_delete) - len(failed),
        failed_keys=failed,
        orphaned_keys=orphaned,
    )


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

    if payload.sample_file_key and not is_admin_sample_key(payload.sample_file_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The sample file is not a valid upload for this schema.",
        )

    if payload.sample_file_key and await _sample_in_use(db, payload.sample_file_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This sample is already used by another schema. Generate a new sample for this schema.",
        )

    # The cleanup may have removed an unsaved sample while the form was open. Storing a key
    # with no file behind it would show a sample that cannot be previewed.
    if payload.sample_file_key and not await asyncio.to_thread(blob_exists, payload.sample_file_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The sample file is no longer stored. Generate the sample again before saving.",
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
        sample_file_key=payload.sample_file_key or None,
        sample_content_type=_content_type_for(payload.sample_file_key) if payload.sample_file_key else None,
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
    keep_sample = False

    if files:
        first_file = files[0]
        sample_type = _sample_content_type(first_file.filename)
        if sample_type is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A sample must be a PDF, PNG or JPEG file.",
            )
        content = await first_file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        # The sample is kept under admin-samples/ so the registry can preview it later.
        temp_key = admin_sample_key(first_file.filename or "sample.pdf")
        source_file_name = first_file.filename
        # Blocking GCS call: run it in a thread so it doesn't stall the event loop.
        await asyncio.to_thread(upload_file_bytes, temp_key, content, sample_type)

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

        keep_sample = True
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
        # Delete the upload only when generation failed. A successful sample is kept for the registry.
        if temp_key and not keep_sample:
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

    old_sample_key = schema.sample_file_key
    if "sample_file_key" in payload.model_fields_set:
        new_sample_key = payload.sample_file_key or None
        if new_sample_key and not is_admin_sample_key(new_sample_key):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The sample file is not a valid upload for this schema.",
            )
        if (
            new_sample_key
            and new_sample_key != old_sample_key
            and await _sample_in_use(db, new_sample_key, exclude_schema_id=schema.id)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This sample is already used by another schema. Generate a new sample for this schema.",
            )
        if (
            new_sample_key
            and new_sample_key != old_sample_key
            and not await asyncio.to_thread(blob_exists, new_sample_key)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The sample file is no longer stored. Generate the sample again before saving.",
            )
        schema.sample_file_key = new_sample_key
        schema.sample_content_type = _content_type_for(new_sample_key) if new_sample_key else None

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

    # Remove the replaced sample only after the change is saved, so a failed save never loses the file.
    if old_sample_key and old_sample_key != schema.sample_file_key and is_admin_sample_key(old_sample_key):
        # Another schema may still point at the old file, so it is deleted only when nothing else uses it.
        if not await _sample_in_use(db, old_sample_key):
            try:
                await asyncio.to_thread(delete_file, old_sample_key)
            except Exception:
                logger.warning("Could not delete the replaced sample %s", old_sample_key, exc_info=True)

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
