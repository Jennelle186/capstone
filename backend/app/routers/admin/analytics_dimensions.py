from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ...database import SessionDep
from ...models import AnalyticsDimension, ExtractionSchema, SchoolYear, SchoolYearRequirement
from ...rbac import require_admin

router = APIRouter(prefix="/analytics-dimensions")

# The canonical field types supported by extraction schemas. Keep in sync with
# the frontend `ExtractionSchemaFieldType` union.
ALLOWED_FIELD_TYPES = {
    "string",
    "number",
    "integer",
    "boolean",
    "select",
    "multi-select",
}


class AnalyticsDimensionCreateRequest(BaseModel):
    canonical_key: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=150)
    field_type: str = Field(min_length=1, max_length=50)
    analytics_group: str | None = Field(default=None, max_length=100)

    @field_validator("canonical_key")
    @classmethod
    def normalize_key(cls, value: str) -> str:
        normalized = value.strip().lower()
        normalized = re.sub(r"\s+", "_", normalized)
        normalized = re.sub(r"[^a-z0-9_.]", "", normalized)
        if not normalized:
            raise ValueError("Canonical key is required.")
        return normalized

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Label is required.")
        return normalized

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: str) -> str:
        if value not in ALLOWED_FIELD_TYPES:
            allowed = ", ".join(sorted(ALLOWED_FIELD_TYPES))
            raise ValueError(f"Invalid field_type. Must be one of: {allowed}")
        return value

    @field_validator("analytics_group")
    @classmethod
    def normalize_group(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AnalyticsDimensionUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=150)
    field_type: str | None = Field(default=None, min_length=1, max_length=50)
    analytics_group: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Label cannot be empty.")
        return normalized

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in ALLOWED_FIELD_TYPES:
            allowed = ", ".join(sorted(ALLOWED_FIELD_TYPES))
            raise ValueError(f"Invalid field_type. Must be one of: {allowed}")
        return value

    @field_validator("analytics_group")
    @classmethod
    def normalize_group(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class AnalyticsDimensionResponse(BaseModel):
    id: str
    canonical_key: str
    label: str
    field_type: str
    analytics_group: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


def _serialize_dimension(dim: AnalyticsDimension) -> AnalyticsDimensionResponse:
    return AnalyticsDimensionResponse(
        id=str(dim.id),
        canonical_key=dim.canonical_key,
        label=dim.label,
        field_type=dim.field_type,
        analytics_group=dim.analytics_group,
        is_active=dim.is_active,
        created_at=dim.created_at,
        updated_at=dim.updated_at,
    )


async def _get_dimension_by_key(
    db: SessionDep, canonical_key: str
) -> AnalyticsDimension | None:
    stmt = select(AnalyticsDimension).where(
        func.lower(AnalyticsDimension.canonical_key) == canonical_key.lower()
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get("", response_model=list[AnalyticsDimensionResponse])
async def list_analytics_dimensions(
    active_only: bool = Query(default=False),
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    stmt = select(AnalyticsDimension).order_by(AnalyticsDimension.canonical_key.asc())
    if active_only:
        stmt = stmt.where(AnalyticsDimension.is_active == True)  # noqa: E712
    dimensions = (await db.execute(stmt)).scalars().all()
    return [_serialize_dimension(dim) for dim in dimensions]


@router.post(
    "",
    response_model=AnalyticsDimensionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_analytics_dimension(
    payload: AnalyticsDimensionCreateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    existing = await _get_dimension_by_key(db, payload.canonical_key)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Canonical key "{payload.canonical_key}" already exists.',
        )

    dimension = AnalyticsDimension(
        canonical_key=payload.canonical_key,
        label=payload.label,
        field_type=payload.field_type,
        analytics_group=payload.analytics_group,
        is_active=True,
    )
    db.add(dimension)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Canonical key "{payload.canonical_key}" already exists.',
        )
    await db.refresh(dimension)
    return _serialize_dimension(dimension)


@router.patch("/{dimension_id}", response_model=AnalyticsDimensionResponse)
async def update_analytics_dimension(
    dimension_id: UUID,
    payload: AnalyticsDimensionUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    if not payload.model_fields_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field must be provided to update a dimension.",
        )

    dimension = await db.get(AnalyticsDimension, dimension_id)
    if dimension is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analytics dimension not found.",
        )

    if "label" in payload.model_fields_set and payload.label is not None:
        dimension.label = payload.label
    if "field_type" in payload.model_fields_set and payload.field_type is not None:
        dimension.field_type = payload.field_type
    if "analytics_group" in payload.model_fields_set:
        dimension.analytics_group = payload.analytics_group
    if "is_active" in payload.model_fields_set and payload.is_active is not None:
        dimension.is_active = payload.is_active

    await db.commit()
    await db.refresh(dimension)
    return _serialize_dimension(dimension)


@router.delete("/{dimension_id}", response_model=AnalyticsDimensionResponse)
async def deactivate_analytics_dimension(
    dimension_id: UUID,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    del current_user
    dimension = await db.get(AnalyticsDimension, dimension_id)
    if dimension is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analytics dimension not found.",
        )

    dimension.is_active = False
    await db.commit()
    await db.refresh(dimension)
    return _serialize_dimension(dimension)


class UnregisteredKeyItem(BaseModel):
    canonical_key: str
    schema_name: str
    school_year_name: str
    field_label: str


@router.get("/unregistered", response_model=list[UnregisteredKeyItem])
async def list_unregistered_keys(
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
):
    """Return analytics-enabled schema fields whose canonical key is not in the registry.

    This helps admins discover orphan keys that need to be registered before they
    appear in analytics reports.
    """
    del current_user

    # 1. Load all registry keys into a lookup set (active or inactive).
    dims = (await db.execute(select(AnalyticsDimension))).scalars().all()
    registry_keys: set[str] = {dim.canonical_key.lower() for dim in dims}

    # 2. Load all schemas and their linked school years.
    schemas = (await db.execute(select(ExtractionSchema))).scalars().all()

    syrs = (await db.execute(select(SchoolYearRequirement))).scalars().all()

    # Batch-load all school years in one query to avoid N+1 lookups.
    all_sy_ids = {syr.school_year_id for syr in syrs if syr.school_year_id}
    sy_names: dict[str, str] = {}
    if all_sy_ids:
        sy_rows = (
            await db.execute(select(SchoolYear).where(SchoolYear.id.in_(all_sy_ids)))
        ).scalars().all()
        sy_names = {str(sy.id): sy.name for sy in sy_rows if sy.name}

    schema_to_years: dict[str, list[str]] = {}
    for syr in syrs:
        sid = str(syr.extraction_schema_id)
        if sid not in schema_to_years:
            schema_to_years[sid] = []
        if syr.school_year_id:
            name = sy_names.get(str(syr.school_year_id))
            if name:
                schema_to_years[sid].append(name)

    # 3. Scan fields and collect unregistered ones.
    result: list[dict] = []
    seen: set[str] = set()
    for schema in schemas:
        fields = schema.fields_json or []
        for field in fields:
            if not isinstance(field, dict):
                continue
            if not field.get("is_analytics"):
                continue
            ck = field.get("canonical_key") or field.get("key")
            if not ck:
                continue
            if ck.lower() in registry_keys:
                continue
            dedupe_key = f"{ck.lower()}:{schema.id}"
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            year_names = schema_to_years.get(str(schema.id), [])
            result.append(
                {
                    "canonical_key": ck,
                    "schema_name": schema.name,
                    "school_year_name": ", ".join(sorted(set(year_names))) if year_names else "Not assigned",
                    "field_label": field.get("analytics_label") or field.get("key", ck),
                }
            )

    return sorted(result, key=lambda x: x["canonical_key"])
