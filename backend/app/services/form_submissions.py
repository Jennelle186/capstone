"""Service layer for the Phase 4B online form fill.

Online-filled values are stored in ``form_submissions`` keyed by the form's
``field_key``. They are distinct from ``DocumentSubmission`` (no uploaded file,
no extraction, no adviser verification). Analytics only consumes them after an
explicit sync once keys match the requirement item's extraction schema (Phase 5).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..database import SessionDep
from ..models import (
    DocumentSubmission,
    Form,
    FormSubmission,
    FormSubmissionStatus,
    RequirementSlotItem,
    Student,
    SubmissionStatus,
)
from .requirements import _bound_form


def _required_field_keys(document_json: dict[str, Any]) -> set[str]:
    """Field keys marked ``required`` in a structured document's blocks/fields."""
    keys: set[str] = set()
    for section in document_json.get("sections", []) or []:
        blocks = section.get("blocks") or []
        if blocks:
            for block in blocks:
                if block.get("type") == "field" and block.get("required"):
                    keys.add(block.get("field_key"))
        else:
            for field in section.get("fields", []) or []:
                if field.get("required"):
                    keys.add(field.get("field_key"))
    return keys


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict, set)):
        return len(value) == 0
    return False


def _missing_required_keys(document_json: dict[str, Any], values: dict[str, Any]) -> list[str]:
    return sorted(
        key for key in _required_field_keys(document_json) if _is_blank(values.get(key))
    )


async def get_fillable_item(
    db: SessionDep,
    student: Student,
    item_id: UUID,
) -> RequirementSlotItem | None:
    """Return the requirement item when it belongs to the student's school year
    and still has a valid bound structured form, else None."""
    if student.school_year_id is None:
        return None

    stmt = (
        select(RequirementSlotItem)
        .where(RequirementSlotItem.id == item_id)
        .options(
            selectinload(RequirementSlotItem.slot),
            selectinload(RequirementSlotItem.form),
        )
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None or item.slot.school_year_id != student.school_year_id:
        return None
    if _bound_form(item) is None:
        return None
    return item


async def get_existing_submission(
    db: SessionDep,
    student_id: UUID,
    form_id: UUID,
    school_year_id: UUID,
) -> FormSubmission | None:
    """Return the current draft if present, else the latest submitted row."""
    stmt = (
        select(FormSubmission)
        .where(
            FormSubmission.student_id == student_id,
            FormSubmission.form_id == form_id,
            FormSubmission.school_year_id == school_year_id,
        )
        .order_by(FormSubmission.created_at.desc())
    )
    rows = list((await db.execute(stmt)).scalars().all())
    for row in rows:
        if row.status == FormSubmissionStatus.DRAFT:
            return row
    return rows[0] if rows else None


async def get_draft(
    db: SessionDep,
    student_id: UUID,
    form_id: UUID,
    school_year_id: UUID,
) -> FormSubmission | None:
    stmt = select(FormSubmission).where(
        FormSubmission.student_id == student_id,
        FormSubmission.form_id == form_id,
        FormSubmission.school_year_id == school_year_id,
        FormSubmission.status == FormSubmissionStatus.DRAFT,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_fill_payload(
    db: SessionDep,
    student: Student,
    item_id: UUID,
) -> tuple[Form, FormSubmission | None]:
    """Return (form, existing submission) for the fill page, or raise 404."""
    item = await get_fillable_item(db, student, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fillable form is bound to this requirement.",
        )
    form = item.form
    submission = await get_existing_submission(
        db, student.id, form.id, student.school_year_id,
    )
    return form, submission


async def save_draft(
    db: SessionDep,
    student: Student,
    item_id: UUID,
    values: dict[str, Any],
) -> FormSubmission:
    item = await get_fillable_item(db, student, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fillable form is bound to this requirement.",
        )
    form = item.form

    draft = await get_draft(db, student.id, form.id, student.school_year_id)
    if draft is not None:
        draft.values = values
        await db.commit()
        await db.refresh(draft)
        return draft

    draft = FormSubmission(
        student_id=student.id,
        form_id=form.id,
        document_type_id=item.document_type_id,
        school_year_id=student.school_year_id,
        values=values,
        status=FormSubmissionStatus.DRAFT,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return draft


async def submit_form(
    db: SessionDep,
    student: Student,
    item_id: UUID,
    values: dict[str, Any],
) -> FormSubmission:
    item = await get_fillable_item(db, student, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No fillable form is bound to this requirement.",
        )
    form = item.form

    missing = _missing_required_keys(form.document_json or {}, values)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Required fields missing: {', '.join(missing)}",
        )

    draft = await get_draft(db, student.id, form.id, student.school_year_id)

    if draft is not None:
        draft.values = values
        draft.status = FormSubmissionStatus.SUBMITTED
        if draft.document_submission_id is None:
            document_submission = DocumentSubmission(
                student_id=student.id,
                file_key="",
                original_filename=form.name,
                is_compiled=False,
                status=SubmissionStatus.SUBMITTED,
                extracted_data=values,
                document_type_id=item.document_type_id,
                filled_online=True,
            )
            db.add(document_submission)
            await db.flush()
            draft.document_submission_id = document_submission.id
        await db.commit()
        await db.refresh(draft)
        return draft

    document_submission = DocumentSubmission(
        student_id=student.id,
        file_key="",
        original_filename=form.name,
        is_compiled=False,
        status=SubmissionStatus.SUBMITTED,
        extracted_data=values,
        document_type_id=item.document_type_id,
        filled_online=True,
    )
    db.add(document_submission)
    await db.flush()

    submission = FormSubmission(
        student_id=student.id,
        form_id=form.id,
        document_type_id=item.document_type_id,
        school_year_id=student.school_year_id,
        values=values,
        status=FormSubmissionStatus.SUBMITTED,
        document_submission_id=document_submission.id,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission
