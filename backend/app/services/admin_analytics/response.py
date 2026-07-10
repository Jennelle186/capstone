from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CanonicalKeyItem(BaseModel):
    canonical_key: str
    label: str
    field_type: str
    analytics_group: str | None = None
    school_year_count: int
    document_types: list[str] = []


class CanonicalKeysResponse(BaseModel):
    keys: list[CanonicalKeyItem]


class FieldInsights(BaseModel):
    total_students: int
    values_present: int
    values_missing: int
    completion_rate: float


class FieldAnalytics(BaseModel):
    canonical_key: str
    key: str
    label: str
    field_type: str
    analytics_mode: str
    analytics_group: str | None = None
    insights: FieldInsights
    distribution: list[dict] | None = None
    student_count: int | None = None
    distribution_basis: str | None = None
    count: int | None = None
    mean: float | None = None
    median: float | None = None
    min: float | None = None
    max: float | None = None
    std: float | None = None
    sum: float | None = None
    true: dict | None = None
    false: dict | None = None


class DocumentComplianceItem(BaseModel):
    document_type: str
    document_code: str
    classification_scope: list[str]
    verified: int
    pending: int
    missing: int
    eligible_students: int
    verification_rate: float


class SnapshotResponse(BaseModel):
    school_year_id: str
    school_year_name: str
    total_students: int
    total_verified_submissions: int
    fields: list[FieldAnalytics]
    document_compliance: list[DocumentComplianceItem]


class TrendSchoolYear(BaseModel):
    school_year_id: str
    school_year_name: str


class TrendField(BaseModel):
    label: str
    field_type: str
    analytics_mode: str
    series: list[dict[str, Any] | None]


class TrendResponse(BaseModel):
    school_years: list[TrendSchoolYear]
    canonical_keys: dict[str, TrendField]


class EnrolmentSeriesItem(BaseModel):
    school_year_id: str
    school_year_name: str
    total_enrolled: int
    verified_students: int
    verification_rate: float | None


class EnrolmentResponse(BaseModel):
    series: list[EnrolmentSeriesItem]