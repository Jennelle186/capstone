from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..database import SessionDep
from ..models import (
    AdminAuditLog,
    Department,
    DocumentSubmission,
    DocumentSubmissionHistory,
    Notification,
    Student,
    StudentClassification,
    User,
    UserRole,
)
from ..rbac import require_roles
from ..services.adviser_core import (
    get_department_ids_for_adviser,
    get_school_year_id,
    list_adviser_departments,
    resolve_adviser,
)
from ..services.helpers import get_active_school_year_id
from ..services.analytics import get_analytics as svc_get_analytics, get_archived as svc_get_archived
from ..services.school_years import list_adviser_school_years as svc_list_school_years
from ..services.students import list_students as svc_list_students, get_student_detail as svc_get_student_detail
from ..services.submissions import (
    flag_submission as svc_flag_submission,
    list_submissions as svc_list_submissions,
    get_submission_download_url as svc_get_download_url,
    get_submission_extractions as svc_get_extractions,
    save_submission_extraction_field as svc_save_extraction_field,
    verify_submission as svc_verify_submission,
)

router = APIRouter(tags=["adviser"])


CurrentAdviser = Depends(require_roles(UserRole.ADVISER))


async def _ensure_department_access(
    db: SessionDep,
    adviser,
    school_year_id: UUID | None,
    department_id: UUID | None,
) -> None:
    """Raise 403 when ``department_id`` is provided but not assigned to the adviser.

    Uses the given school year to resolve the adviser's assignments. When
    ``department_id`` is ``None`` (no filter requested) this is a no-op.
    """
    if department_id is None:
        return
    dept_ids = await get_department_ids_for_adviser(db, adviser, school_year_id)
    if department_id not in dept_ids:
        raise HTTPException(status_code=403, detail="Department not assigned to this adviser")


class AdviserSubmissionResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    student_number: str | None
    initials: str
    document_type_name: str | None
    status: str
    created_at: str
    extraction_fields: dict = Field(default_factory=dict)


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
    image_url: str | None = None
    program: str | None
    school_year: str | None
    classification: str | None
    application_status: str | None = None
    documents_submitted: int
    documents_total: int
    completion_pct: int
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
    image_url: str | None = None
    program: str | None
    program_id: str | None = None
    program_mismatch_pending: bool = False
    program_mismatch_extracted: str | None = None
    school_year: str | None
    classification: str | None
    application_status: str | None = None
    documents_submitted: int
    documents_total: int
    completion_pct: int
    extracted_analytics: dict = {}
    unmapped_data: list = []
    created_at: str
    submissions: list[AdviserStudentSubmissionResponse]
    slots: list[dict] = Field(default_factory=list)


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
    student_status_distribution: list[ArchivedStatusDistribution]
    student_completion_rate: int


class AdviserArchivedResponse(BaseModel):
    analytics: AdviserArchivedAnalytics
    students: list[AdviserStudentResponse]


# ─── GET /api/adviser/submissions ───────────────────────────────────────────

@router.get("/api/adviser/submissions", response_model=list[AdviserSubmissionResponse])
async def list_adviser_submissions(
    school_year_id: Optional[str] = Query(None, description="Optional school year UUID. Defaults to active school year."),
    department_id: Optional[UUID] = Query(None, description="Optional department UUID. Defaults to all assigned departments."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserSubmissionResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    target_sy_id = await get_school_year_id(db, school_year_id)
    if target_sy_id is None:
        return []
    await _ensure_department_access(db, adviser, target_sy_id, department_id)
    rows = await svc_list_submissions(db, adviser, school_year_id, department_id)
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


class AdviserDepartmentResponse(BaseModel):
    id: str
    name: str
    code: str


# ─── GET /api/adviser/departments ────────────────────────────────────────────

@router.get("/api/adviser/departments", response_model=list[AdviserDepartmentResponse])
async def list_adviser_departments_endpoint(
    school_year_id: Optional[str] = Query(None, description="Optional school year UUID. Defaults to active school year."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserDepartmentResponse]:
    """List the departments assigned to the adviser for a school year.

    Used by the dashboard to render the program selector. Defaults to the
    active school year when no ``school_year_id`` is provided.
    """
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    target_sy_id = await get_school_year_id(db, school_year_id)
    if target_sy_id is None:
        return []
    departments = await list_adviser_departments(db, adviser, target_sy_id)
    return [AdviserDepartmentResponse(**d) for d in departments]


# ─── GET /api/adviser/students ──────────────────────────────────────────────

@router.get("/api/adviser/students", response_model=list[AdviserStudentResponse])
async def list_adviser_students(
    school_year_id: Optional[str] = Query(None, description="Optional school year UUID. Defaults to active school year."),
    department_id: Optional[UUID] = Query(None, description="Optional department UUID. Defaults to all assigned departments."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[AdviserStudentResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return []
    target_sy_id = await get_school_year_id(db, school_year_id)
    if target_sy_id is None:
        return []
    await _ensure_department_access(db, adviser, target_sy_id, department_id)
    rows = await svc_list_students(db, adviser, school_year_id, department_id)
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


# ─── PATCH /api/adviser/students/{student_id}/classification ──────────────


class ClassificationUpdateRequest(BaseModel):
    classification: str


@router.patch("/api/adviser/students/{student_id}/classification")
async def update_student_classification(
    student_id: str,
    body: ClassificationUpdateRequest,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> dict:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    try:
        uid = UUID(student_id)
    except ValueError:
        raise HTTPException(404, "Student not found.")
    student = await db.get(Student, uid)
    if student is None:
        raise HTTPException(404, "Student not found.")
    if student.program_id is not None and student.school_year_id is not None:
        dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
        if student.program_id not in dept_ids:
            raise HTTPException(404, "Student not found.")
    try:
        classification_value = StudentClassification(body.classification)
    except ValueError:
        raise HTTPException(400, f"Invalid classification: {body.classification}")
    student.classification = classification_value
    student.classification_set_by_user = True
    await db.commit()
    return {"classification": student.classification.value}


# ─── PATCH /api/adviser/students/{student_id}/student-number ────────────────


class StudentNumberUpdateRequest(BaseModel):
    student_number: str = Field(..., min_length=3, max_length=30)


@router.patch("/api/adviser/students/{student_id}/student-number")
async def update_student_number(
    student_id: str,
    body: StudentNumberUpdateRequest,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> dict:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    try:
        uid = UUID(student_id)
    except ValueError:
        raise HTTPException(404, "Student not found.")
    student = await db.get(Student, uid)
    if student is None:
        raise HTTPException(404, "Student not found.")
    if student.program_id is not None and student.school_year_id is not None:
        dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
        if student.program_id not in dept_ids:
            raise HTTPException(404, "Student not found.")
    student.student_number = body.student_number
    await db.commit()
    return {"student_number": student.student_number}


# ─── POST /api/adviser/students/{student_id}/reassign-program ───────────────


class ReassignProgramRequest(BaseModel):
    program_id: str
    reason: str | None = None


class ReassignProgramResponse(BaseModel):
    student_id: str
    new_program_id: str
    previous_program_id: str | None


@router.post("/api/adviser/students/{student_id}/reassign-program", response_model=ReassignProgramResponse)
async def reassign_student_program(
    student_id: str,
    body: ReassignProgramRequest,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> ReassignProgramResponse:
    """Reassign a student to a different program (department).

    Used to correct a wrong program selection that routed the student to the
    wrong adviser. The adviser must have access to the student's current
    program, and the target program must be an active department.
    """
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    try:
        uid = UUID(student_id)
    except ValueError:
        raise HTTPException(404, "Student not found.")
    student = await db.get(Student, uid)
    if student is None:
        raise HTTPException(404, "Student not found.")

    if student.school_year_id is None:
        raise HTTPException(400, "Student has no school year assigned.")

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        raise HTTPException(404, "Student not found.")

    try:
        new_program_id = UUID(body.program_id)
    except ValueError:
        raise HTTPException(400, "Invalid program id.")

    new_dept = await db.get(Department, new_program_id)
    if new_dept is None or not new_dept.is_active:
        raise HTTPException(400, "Invalid or inactive department.")

    previous_program_id = student.program_id
    student.program_id = new_dept.id
    student.program_mismatch_pending = False
    student.program_mismatch_extracted = None

    db.add(
        AdminAuditLog(
            action="REASSIGN_PROGRAM",
            entity_type="student",
            entity_id=student.id,
            school_year_id=student.school_year_id,
            actor_user_id=adviser.user_id,
            previous_values={"program_id": str(previous_program_id)} if previous_program_id else None,
            new_values={"program_id": str(new_dept.id)},
            audit_metadata={"reason": body.reason} if body.reason else None,
        )
    )

    db.add(
        Notification(
            recipient_id=student.user_id,
            title="Program Updated",
            message=f"Your adviser updated your program to {new_dept.name}."
            + (f" Reason: {body.reason}" if body.reason else ""),
            notification_type="PROGRAM_REASSIGNED",
            reference_id=student.id,
        )
    )

    await db.commit()

    return ReassignProgramResponse(
        student_id=str(student.id),
        new_program_id=str(new_dept.id),
        previous_program_id=str(previous_program_id) if previous_program_id else None,
    )


# ─── GET /api/adviser/analytics ─────────────────────────────────────────────

@router.get("/api/adviser/analytics", response_model=AdviserAnalyticsResponse)
async def get_adviser_analytics(
    department_id: Optional[UUID] = Query(None, description="Optional department UUID. Defaults to all assigned departments."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserAnalyticsResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        return AdviserAnalyticsResponse(totalStudents=0, pendingReviews=0, submittedToday=0, verifiedCount=0, progressPercent=0)
    active_sy_id = await get_active_school_year_id(db)
    if active_sy_id is not None:
        await _ensure_department_access(db, adviser, active_sy_id, department_id)
    data = await svc_get_analytics(db, adviser, department_id)
    return AdviserAnalyticsResponse(**data)


# ─── PATCH /api/adviser/submissions/{submission_id}/verify ──────────────────


class VerifySubmissionResponse(BaseModel):
    status: str
    submission_id: str
    program_mismatch_pending: bool = False
    program_mismatch_extracted: str | None = None


@router.patch("/api/adviser/submissions/{submission_id}/verify", response_model=VerifySubmissionResponse)
async def verify_adviser_submission(
    submission_id: str,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> VerifySubmissionResponse:
    """Mark a submission as verified."""
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_verify_submission(db, submission_id, adviser)
    if result is None:
        raise HTTPException(404, "Submission not found.")
    return VerifySubmissionResponse(**result)


# ─── PATCH /api/adviser/submissions/{submission_id}/flag ────────────────────


class FlagSubmissionRequest(BaseModel):
    reason: str


class FlagSubmissionResponse(BaseModel):
    status: str
    submission_id: str
    reason: str


@router.patch("/api/adviser/submissions/{submission_id}/flag", response_model=FlagSubmissionResponse)
async def flag_adviser_submission(
    submission_id: str,
    body: FlagSubmissionRequest,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> FlagSubmissionResponse:
    """Flag a submission with a reason."""
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    result = await svc_flag_submission(db, submission_id, adviser, body.reason)
    if result is None:
        raise HTTPException(404, "Submission not found.")
    return FlagSubmissionResponse(**result)


# ─── GET /api/adviser/archived ──────────────────────────────────────────────

@router.get("/api/adviser/archived", response_model=AdviserArchivedResponse)
async def get_adviser_archived(
    school_year_id: str = Query(..., description="School year UUID to query archived data for."),
    department_id: Optional[UUID] = Query(None, description="Optional department UUID. Defaults to all assigned departments."),
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> AdviserArchivedResponse:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")
    try:
        sy_id = UUID(school_year_id)
    except ValueError:
        raise HTTPException(404, "School year not found.")
    await _ensure_department_access(db, adviser, sy_id, department_id)
    result = await svc_get_archived(db, adviser, school_year_id, department_id)
    if result is None:
        raise HTTPException(404, "School year not found.")
    return AdviserArchivedResponse(
        analytics=AdviserArchivedAnalytics(**result["analytics"]),
        students=[AdviserStudentResponse(**s) for s in result["students"]],
    )


class SubmissionHistoryEntryResponse(BaseModel):
    id: str
    action: str
    actor_name: str | None = None
    previous_status: str | None = None
    new_status: str | None = None
    reason: str | None = None
    reference_submission_id: str | None = None
    created_at: str


@router.get("/api/adviser/submissions/{submission_id}/history", response_model=list[SubmissionHistoryEntryResponse])
async def get_adviser_submission_history(
    submission_id: UUID,
    current_user: dict = CurrentAdviser,
    db: SessionDep = None,
) -> list[SubmissionHistoryEntryResponse]:
    adviser = await resolve_adviser(db, current_user)
    if not adviser:
        raise HTTPException(404, "Adviser not found.")

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None:
        raise HTTPException(404, "Submission not found.")

    student = await db.get(Student, submission.student_id)
    if student is None:
        raise HTTPException(404, "Submission student not found.")
    if student.school_year_id is None:
        raise HTTPException(404, "Student has no school year assigned.")

    dept_ids = await get_department_ids_for_adviser(db, adviser, student.school_year_id)
    if student.program_id not in dept_ids:
        raise HTTPException(403, detail="You do not have permission to view this submission's history.")

    db_result = await db.execute(
        select(DocumentSubmissionHistory, User)
        .outerjoin(User, DocumentSubmissionHistory.actor_user_id == User.id)
        .where(DocumentSubmissionHistory.submission_id == submission_id)
        .order_by(DocumentSubmissionHistory.created_at)
    )
    rows = db_result.all()

    result_entries = []
    for history, user_obj in rows:
        reason = history.reason
        if history.action in ("REPLACEMENT_OF", "REUPLOADED") and history.reference_submission_id:
            ref_sub = await db.get(DocumentSubmission, history.reference_submission_id)
            if ref_sub and ref_sub.rejection_reason:
                reason = ref_sub.rejection_reason

        result_entries.append(SubmissionHistoryEntryResponse(
            id=str(history.id),
            action=history.action,
            actor_name=f"{user_obj.first_name} {user_obj.last_name}".strip() if user_obj else None,
            previous_status=history.previous_status,
            new_status=history.new_status,
            reason=reason,
            reference_submission_id=str(history.reference_submission_id) if history.reference_submission_id else None,
            created_at=history.created_at.isoformat() if history.created_at else "",
        ))

    return result_entries
