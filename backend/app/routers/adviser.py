from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..database import SessionDep
from ..models import UserRole
from ..rbac import require_roles
from ..services.adviser_core import resolve_adviser
from ..services.analytics import get_analytics as svc_get_analytics, get_archived as svc_get_archived
from ..services.school_years import list_school_years as svc_list_school_years
from ..services.students import list_students as svc_list_students, get_student_detail as svc_get_student_detail
from ..services.submissions import (
    list_submissions as svc_list_submissions,
    get_submission_download_url as svc_get_download_url,
    get_submission_extractions as svc_get_extractions,
    save_submission_extraction_field as svc_save_extraction_field,
)

router = APIRouter(tags=["adviser"])


CurrentAdviser = Depends(require_roles(UserRole.ADVISER))


class AdviserSubmissionResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    student_number: str | None
    initials: str
    document_type_name: str | None
    status: str
    created_at: str
    extraction_fields: dict = {}


class DownloadUrlResponse(BaseModel):
    url: str


class AdviserExtractionFieldOption(BaseModel):
    value: str
    label: str


class AdviserExtractionFieldResponse(BaseModel):
    id: str
    key: str
    type: str = "string"
    description: str
    required: bool = False
    value: str
    confidence: float
    needs_review: bool
    ui_component: str | None = None
    options: list[AdviserExtractionFieldOption] | None = None
    section_title: str | None = None


class AdviserExtractionItemResponse(BaseModel):
    submission_id: str
    classification_result: dict | None = None
    fields: list[AdviserExtractionFieldResponse]


class SaveExtractionFieldRequest(BaseModel):
    field_id: str
    value: str


class SaveExtractionFieldResponse(BaseModel):
    field_id: str
    value: str
    needs_review: bool
    confidence: float


class AdviserSchoolYearResponse(BaseModel):
    id: str
    name: str
    is_current: bool


class AdviserStudentResponse(BaseModel):
    id: str
    name: str
    initials: str
    student_number: str | None
    email: str | None
    program: str | None
    school_year: str | None
    classification: str | None
    documents_submitted: int
    documents_total: int
    completion_pct: int
    gender: str | None = None
    cet_score: int | None = None
    gpa: float | None = None
    high_school: str | None = None
    provincial_address: str | None = None
    created_at: str


class AdviserStudentSubmissionResponse(BaseModel):
    id: str
    document_type: str | None
    status: str
    submitted_at: str
    extraction_fields: dict


class AdviserStudentDetailResponse(BaseModel):
    id: str
    name: str
    initials: str
    student_number: str | None
    email: str | None
    program: str | None
    school_year: str | None
    classification: str | None
    documents_submitted: int
    documents_total: int
    completion_pct: int
    gender: str | None = None
    cet_score: int | None = None
    gpa: float | None = None
    high_school: str | None = None
    provincial_address: str | None = None
    created_at: str
    submissions: list[AdviserStudentSubmissionResponse]


class AdviserAnalyticsResponse(BaseModel):
    totalStudents: int
    pendingReviews: int
    submittedToday: int
    verifiedCount: int
    progressPercent: int


class ArchivedStatusDistribution(BaseModel):
    status: str
    count: int


class ArchivedMonthlySubmission(BaseModel):
    month: str
    count: int


class AdviserArchivedAnalytics(BaseModel):
    school_year: str
    total_students: int
    total_submissions: int
    verification_rate: int
    avg_processing_days: float | None
    status_distribution: list[ArchivedStatusDistribution]
    monthly_submissions: list[ArchivedMonthlySubmission]


class AdviserArchivedResponse(BaseModel):
    analytics: AdviserArchivedAnalytics
    students: list[AdviserStudentResponse]


# ─── GET /api/adviser/submissions ───────────────────────────────────────────

@router.get("/api/adviser/submissions", response_model=list[AdviserSubmissionResponse])
async def list_adviser_submissions(
    school_year_id: Optional[str] = Query(None, description="Optional school year UUID. Defaults to active school year."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserSubmissionResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    rows = await svc_list_submissions(db, adviser, school_year_id)
    return [AdviserSubmissionResponse(**r) for r in rows]


# ─── GET /api/adviser/submissions/{submission_id}/download-url ──────────────

@router.get("/api/adviser/submissions/{submission_id}/download-url", response_model=DownloadUrlResponse)
async def get_adviser_download_url(
    submission_id: str,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> DownloadUrlResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    url = await svc_get_download_url(db, adviser, submission_id)
    if url is None:
        raise HTTPException(404, "Submission not found or access denied.")
    return DownloadUrlResponse(url=url)


# ─── GET /api/adviser/submissions/{submission_id}/extractions ──────────────

@router.get("/api/adviser/submissions/{submission_id}/extractions", response_model=AdviserExtractionItemResponse | None)
async def get_adviser_submission_extractions(
    submission_id: str,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserExtractionItemResponse | None:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_get_extractions(db, adviser, submission_id)
    if result is None:
        return None
    return AdviserExtractionItemResponse(
        submission_id=result["submission_id"],
        classification_result=result.get("classification_result"),
        fields=[AdviserExtractionFieldResponse(**f) for f in result["fields"]],
    )


# ─── PATCH /api/adviser/submissions/{submission_id}/extractions ──────────────

@router.patch("/api/adviser/submissions/{submission_id}/extractions", response_model=SaveExtractionFieldResponse)
async def save_adviser_extraction_field(
    submission_id: str,
    body: SaveExtractionFieldRequest,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> SaveExtractionFieldResponse:
    """Save a single extracted field value for a document submission."""
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_save_extraction_field(db, adviser, submission_id, body.field_id, body.value)
    if result is None:
        raise HTTPException(404, "Submission not found.")
    return SaveExtractionFieldResponse(**result)


# ─── GET /api/adviser/school-years ──────────────────────────────────────────

@router.get("/api/adviser/school-years", response_model=list[AdviserSchoolYearResponse])
async def list_adviser_school_years(
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserSchoolYearResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    rows = await svc_list_school_years(db, adviser)
    return [AdviserSchoolYearResponse(**r) for r in rows]


# ─── GET /api/adviser/students ──────────────────────────────────────────────

@router.get("/api/adviser/students", response_model=list[AdviserStudentResponse])
async def list_adviser_students(
    school_year_id: Optional[str] = Query(None, description="Optional school year UUID. Defaults to active school year."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserStudentResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    rows = await svc_list_students(db, adviser, school_year_id)
    return [AdviserStudentResponse(**r) for r in rows]


# ─── GET /api/adviser/students/{student_id} ─────────────────────────────────

@router.get("/api/adviser/students/{student_id}", response_model=AdviserStudentDetailResponse)
async def get_adviser_student_detail(
    student_id: str,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserStudentDetailResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_get_student_detail(db, adviser, student_id)
    if result is None:
        raise HTTPException(404, "Student not found.")
    return AdviserStudentDetailResponse(
        **{k: v for k, v in result.items() if k != "submissions"},
        submissions=[AdviserStudentSubmissionResponse(**s) for s in result["submissions"]],
    )


# ─── GET /api/adviser/analytics ─────────────────────────────────────────────

@router.get("/api/adviser/analytics", response_model=AdviserAnalyticsResponse)
async def get_adviser_analytics(
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserAnalyticsResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return AdviserAnalyticsResponse(totalStudents=0, pendingReviews=0, submittedToday=0, verifiedCount=0, progressPercent=0)
    data = await svc_get_analytics(db, adviser)
    return AdviserAnalyticsResponse(**data)


# ─── GET /api/adviser/archived ──────────────────────────────────────────────

@router.get("/api/adviser/archived", response_model=AdviserArchivedResponse)
async def get_adviser_archived(
    school_year_id: str = Query(..., description="School year UUID to query archived data for."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserArchivedResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_get_archived(db, adviser, school_year_id)
    if result is None:
        raise HTTPException(404, "School year not found.")
    return AdviserArchivedResponse(
        analytics=AdviserArchivedAnalytics(**result["analytics"]),
        students=[AdviserStudentResponse(**s) for s in result["students"]],
    )
