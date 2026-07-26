from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from ..models import SchoolYearStatus


class SchoolYearResponse(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    auto_closure_date: date | None
    status: SchoolYearStatus
    is_active: bool
    adviser_assignment_count: int = 0
    requirement_count: int = 0
    active_department_count: int = 0
    missing_department_assignments: list[str] = Field(default_factory=list)
    readiness_issues: list[str] = Field(default_factory=list)
    is_ready: bool = False
    created_at: datetime
    updated_at: datetime


class SchoolYearCreateRequest(BaseModel):
    name: str = Field(min_length=4, max_length=64)
    start_date: date
    end_date: date
    auto_closure_date: date | None = None
    status: SchoolYearStatus = SchoolYearStatus.UPCOMING
    set_as_active: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("School year name is required.")
        return normalized


class SchoolYearUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=4, max_length=64)
    start_date: date | None = None
    end_date: date | None = None
    auto_closure_date: date | None = None
    status: SchoolYearStatus | None = None
    set_as_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("School year name is required.")
        return normalized


class SchoolYearRolloverRequest(BaseModel):
    name: str = Field(min_length=4, max_length=64)
    start_date: date
    end_date: date
    auto_closure_date: date | None = None
    copy_assignments: bool = True
    copy_requirements: bool = True
    set_as_active: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("School year name is required.")
        return normalized


class SchoolYearDepartmentAssignmentResponse(BaseModel):
    department_id: str
    department_code: str
    department_name: str
    department_is_active: bool
    adviser_id: str | None
    adviser_name: str | None
    adviser_email: str | None


class AdminAuditLogResponse(BaseModel):
    id: str
    school_year_id: str
    action: str
    actor_user_id: str | None
    actor_clerk_user_id: str | None
    actor_name: str | None
    previous_values: dict | None
    new_values: dict | None
    created_at: datetime


class SchoolYearActivationPreviewResponse(BaseModel):
    selected_school_year: SchoolYearResponse
    current_active_school_year: SchoolYearResponse | None
    will_replace_current_active: bool
    can_activate: bool
    readiness_issues: list[str]
    adviser_assignment_count: int
    requirement_count: int
    missing_department_assignments: list[str]


class SchoolYearAutoClosureResponse(BaseModel):
    closed_school_years: list[SchoolYearResponse]
    closed_count: int
