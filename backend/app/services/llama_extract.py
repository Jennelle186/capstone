from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import HTTPException, UploadFile, status

from ..schemas.admission_forms import AdmissionSchemaField

LLAMA_CLOUD_BASE_URL = "https://api.cloud.llamaindex.ai"


def get_llama_cloud_api_key() -> str:
    api_key = os.getenv("LLAMA_CLOUD_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LLAMA_CLOUD_API_KEY is not configured.",
        )
    return api_key


def get_llama_cloud_project_id() -> str | None:
    return os.getenv("LLAMA_CLOUD_PROJECT_ID", "").strip() or None


def _llama_query_params() -> dict[str, str]:
    project_id = get_llama_cloud_project_id()
    return {"project_id": project_id} if project_id else {}


async def upload_extract_file(file: UploadFile) -> dict[str, Any]:
    api_key = get_llama_cloud_api_key()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sample file is empty.")

    headers = {"Authorization": f"Bearer {api_key}"}
    files = {
        "file": (
            file.filename or "admission-form.pdf",
            content,
            file.content_type or "application/octet-stream",
        )
    }
    data = {"purpose": "extract"}

    async with httpx.AsyncClient(base_url=LLAMA_CLOUD_BASE_URL, timeout=120) as client:
        response = await client.post(
            "/api/v1/beta/files",
            headers=headers,
            params=_llama_query_params(),
            files=files,
            data=data,
        )

    if response.is_error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Llama file upload failed: {response.text}",
        )
    return response.json()


async def generate_schema_from_file(file_id: str, prompt: str | None) -> dict[str, Any]:
    api_key = get_llama_cloud_api_key()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "accept": "application/json",
    }
    body: dict[str, Any] = {"file_id": file_id}
    if prompt and prompt.strip():
        body["prompt"] = prompt.strip()

    async with httpx.AsyncClient(base_url=LLAMA_CLOUD_BASE_URL, timeout=180) as client:
        response = await client.post(
            "/api/v2/extract/schema/generate",
            headers=headers,
            params=_llama_query_params(),
            json=body,
        )

    if response.is_error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Llama schema generation failed: {response.text}",
        )
    return response.json()


def extract_data_schema(generated_config: dict[str, Any]) -> dict[str, Any]:
    parameters = generated_config.get("parameters")
    if isinstance(parameters, dict):
        data_schema = parameters.get("data_schema")
        if isinstance(data_schema, dict):
            return data_schema

    data_schema = generated_config.get("data_schema")
    if isinstance(data_schema, dict):
        return data_schema

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Llama schema generation did not return a data_schema.",
    )


def _resolve_schema_type(schema: dict[str, Any]) -> str:
    schema_type = schema.get("type")
    if isinstance(schema_type, str):
        return schema_type

    any_of = schema.get("anyOf")
    if isinstance(any_of, list):
        for option in any_of:
            if not isinstance(option, dict):
                continue
            option_type = option.get("type")
            if isinstance(option_type, str) and option_type != "null":
                return option_type

    return "string"


def schema_to_editable_fields(
    data_schema: dict[str, Any],
    parent_key: str = "",
    parent_required: set[str] | None = None,
) -> list[AdmissionSchemaField]:
    properties = data_schema.get("properties")
    if not isinstance(properties, dict):
        return []

    required_values = data_schema.get("required")
    required = set(required_values if isinstance(required_values, list) else [])
    fields: list[AdmissionSchemaField] = []

    for index, (key, value) in enumerate(properties.items()):
        if not isinstance(key, str) or not isinstance(value, dict):
            continue

        field_key = f"{parent_key}.{key}" if parent_key else key
        schema_type = _resolve_schema_type(value)
        if schema_type == "object":
            fields.extend(schema_to_editable_fields(value, parent_key=field_key, parent_required=required))
            continue

        if schema_type not in {"string", "number", "integer", "boolean"}:
            schema_type = "string"

        description = value.get("description")
        fields.append(
            AdmissionSchemaField(
                id=f"generated-{index}-{field_key}",
                key=field_key,
                type=schema_type,
                description=description if isinstance(description, str) else "",
                required=key in required or (parent_required is not None and parent_key in parent_required),
            )
        )

    return fields
