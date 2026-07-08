from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select

from ...database import SessionDep
from ...models import DocumentType, ExtractionSchema, ExtractionSchemaStatus
from ...rbac import require_admin
from ...schemas.extraction_schemas import (
    SandboxClassificationResult,
    SandboxExtractionResponse,
    SandboxFieldResult,
    SandboxSchemaInfo,
)
from ...services.gcp_pipeline import GcpPipelineError, classify_document, extract_fields_from_document
from ...services.gcp_storage import _admin_temp_prefix, delete_file, upload_file_bytes

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/extractions/run", response_model=SandboxExtractionResponse)
async def run_sandbox_extraction(
    files: list[UploadFile] | None = File(default=None),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided.")

    first_file = files[0]
    content = await first_file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    temp_key = f"{_admin_temp_prefix()}{uuid.uuid4().hex}/{first_file.filename or 'upload.pdf'}"
    upload_file_bytes(temp_key, content)

    try:
        # ── Classification ────────────────────────────────────────────────
        doc_types = (await db.execute(select(DocumentType))).scalars().all()

        class_result: SandboxClassificationResult
        matched_doc_type_id: str | None = None
        matched_doc_type: DocumentType | None = None

        try:
            classification = await asyncio.to_thread(classify_document, temp_key, doc_types)
            match_data = classification.get("match", {})
            type_code = match_data.get("type")
            confidence = float(match_data.get("confidence", 0.0))
            reasoning = str(match_data.get("reasoning", ""))

            if type_code:
                matched_doc_type = next(
                    (dt for dt in doc_types if dt.code == type_code),
                    None,
                )
                if matched_doc_type:
                    matched_doc_type_id = str(matched_doc_type.id)

            class_result = SandboxClassificationResult(
                document_type_id=matched_doc_type_id,
                document_type_name=matched_doc_type.name if matched_doc_type else "",
                document_type_code=type_code or "",
                confidence=confidence,
                reasoning=reasoning,
            )
        except Exception:
            logger.warning("Sandbox classification failed", exc_info=True)
            class_result = SandboxClassificationResult()

        # ── Active Schema Lookup ──────────────────────────────────────────
        schema_info: SandboxSchemaInfo | None = None
        field_defs: list[dict] = []

        if matched_doc_type_id:
            active_schema = (
                await db.execute(
                    select(ExtractionSchema).where(
                        ExtractionSchema.document_type_id == matched_doc_type.id,
                        ExtractionSchema.status == ExtractionSchemaStatus.ACTIVE,
                    )
                )
            ).scalar_one_or_none()

            if active_schema and active_schema.fields_json:
                schema_info = SandboxSchemaInfo(
                    id=str(active_schema.id),
                    name=active_schema.name,
                )
                field_defs = [dict(f) for f in active_schema.fields_json]

        # ── Field Extraction ──────────────────────────────────────────────
        fields_result: list[SandboxFieldResult] = []

        if field_defs:
            try:
                extracted = await asyncio.to_thread(
                    extract_fields_from_document,
                    temp_key,
                    field_defs,
                )

                for fd in field_defs:
                    field_key = fd.get("key", "")
                    gemini_result = extracted.get(field_key, {})
                    if isinstance(gemini_result, dict):
                        value = str(gemini_result.get("value", "") or "")
                        conf = float(gemini_result.get("confidence", 0.0))
                    else:
                        value = str(gemini_result) if gemini_result else ""
                        conf = 0.0

                    fields_result.append(SandboxFieldResult(
                        key=field_key,
                        label=fd.get("description", ""),
                        type=fd.get("type", "string"),
                        value=value,
                        confidence=conf,
                    ))
            except Exception:
                logger.warning("Sandbox field extraction failed", exc_info=True)

        return SandboxExtractionResponse(
            classification=class_result,
            schema_info=schema_info,
            fields=fields_result,
        )

    except Exception as exc:
        logger.exception("Sandbox extraction failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sandbox extraction failed: {exc}",
        )
    finally:
        try:
            await asyncio.to_thread(delete_file, temp_key)
        except Exception:
            pass
