"""Student-facing Phase 4B online form fill endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ...database import SessionDep
from ...models import DocumentSubmission, Form, FormSubmission, Student
from ...schemas.form_submissions import (
    FilledFormResponse,
    FormFillResponse,
    FormSubmissionResponse,
    SaveFormSubmissionRequest,
    SubmitFormSubmissionRequest,
)
from ...services.form_submissions import get_fill_payload, save_draft, submit_form
from ...services.user_sync import ensure_user_row
from ..documents.schemas import StudentClaims

router = APIRouter(tags=["students"])


def _to_response(submission: FormSubmission) -> FormSubmissionResponse:
    return FormSubmissionResponse(
        id=submission.id,
        form_id=submission.form_id,
        document_type_id=submission.document_type_id,
        school_year_id=submission.school_year_id,
        values=submission.values,
        status=submission.status.value,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


async def _resolve_student(db: SessionDep, current_user: StudentClaims) -> Student:
    user = await ensure_user_row(db, current_user)
    result = await db.execute(select(Student).where(Student.user_id == user.id))
    student = result.scalar_one_or_none()
    if student is None or student.school_year_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fillable form is bound to this requirement.",
        )
    return student


@router.get("/api/me/requirement-items/{item_id}/fill", response_model=FormFillResponse)
async def get_fill(
    item_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> FormFillResponse:
    student = await _resolve_student(db, current_user)
    form, submission = await get_fill_payload(db, student, item_id)
    return FormFillResponse(
        form_id=form.id,
        form_name=form.name,
        document_json=form.document_json,
        submission=_to_response(submission) if submission else None,
    )


@router.put(
    "/api/me/requirement-items/{item_id}/form-submission",
    response_model=FormSubmissionResponse,
)
async def put_draft(
    item_id: UUID,
    payload: SaveFormSubmissionRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> FormSubmissionResponse:
    student = await _resolve_student(db, current_user)
    submission = await save_draft(db, student, item_id, payload.values)
    return _to_response(submission)


@router.post(
    "/api/me/requirement-items/{item_id}/form-submission/submit",
    response_model=FormSubmissionResponse,
)
async def post_submit(
    item_id: UUID,
    payload: SubmitFormSubmissionRequest,
    current_user: StudentClaims,
    db: SessionDep,
) -> FormSubmissionResponse:
    student = await _resolve_student(db, current_user)
    submission = await submit_form(db, student, item_id, payload.values)
    return _to_response(submission)


@router.get("/api/me/documents/{submission_id}/filled-form", response_model=FilledFormResponse)
async def get_filled_form(
    submission_id: UUID,
    current_user: StudentClaims,
    db: SessionDep,
) -> FilledFormResponse:
    """Return the form layout + typed values for a filled-online document."""
    student = await _resolve_student(db, current_user)

    submission = await db.get(DocumentSubmission, submission_id)
    if submission is None or submission.student_id != student.id or not submission.filled_online:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This document was not filled online.",
        )

    fs = (
        await db.execute(
            select(FormSubmission).where(FormSubmission.document_submission_id == submission.id)
        )
    ).scalar_one_or_none()
    if fs is None or fs.form_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The filled form is no longer available.",
        )

    form = await db.get(Form, fs.form_id)
    if form is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The filled form is no longer available.",
        )

    return FilledFormResponse(
        form_id=form.id,
        form_name=form.name,
        document_json=form.document_json,
        values=fs.values or {},
    )
