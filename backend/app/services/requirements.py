from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from ..database import SessionDep
from ..models import (
    DocumentSubmission,
    DocumentType,
    DocumentTypeStatus,
    ExtractionSchema,
    ExtractionSchemaStatus,
    RequirementSlot,
    RequirementSlotItem,
    SchoolYear,
    SchoolYearRequirement,
    SchoolYearStatus,
    Student,
    SubmissionStatus,
)
from ..schemas.requirements import (
    SlotItemResponse,
    SlotItemStatus,
    SlotResponse,
    SlotStatusResponse,
)

logger = logging.getLogger(__name__)


# ── Helpers ─────────────────────────────────────────────────────────────


async def get_school_year_or_404(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await db.get(SchoolYear, school_year_id)
    if school_year is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found.")
    return school_year


async def ensure_slots_mutable(db: SessionDep, school_year_id: UUID) -> SchoolYear:
    school_year = await get_school_year_or_404(db, school_year_id)
    if school_year.status == SchoolYearStatus.CLOSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed school years cannot be modified.",
        )
    return school_year


# ── Dual-read: resolve requirement slots for a student ──────────────────


async def get_requirement_slots_for_student(
    db: SessionDep,
    student: Student,
) -> list[RequirementSlot]:
    """
    Dual-read resolver.

    1. Query the new ``requirement_slots`` table first.
    2. If no slots exist for the student's school year, fall back to the
       legacy ``school_year_requirements`` table and convert each row into
       a solo ``RequirementSlot`` on-the-fly.

    Returns slots filtered by the student's ``classification`` against each
    ``DocumentType.applicable_classifications`` — the same filter that
    ``get_required_document_types_for_student`` applied.
    """
    if student.school_year_id is None:
        return []

    # ── Try new tables ──────────────────────────────────────────────
    stmt = (
        select(RequirementSlot)
        .where(RequirementSlot.school_year_id == student.school_year_id)
        .order_by(RequirementSlot.display_order)
        .options(
            selectinload(RequirementSlot.items).selectinload(RequirementSlotItem.document_type),
            selectinload(RequirementSlot.items).selectinload(RequirementSlotItem.extraction_schema),
        )
    )
    slots = list((await db.execute(stmt)).scalars().all())

    if slots:
        return _filter_slots_by_classification(slots, student.classification)

    # ── Fallback: convert legacy rows to solo slots ─────────────────
    logger.info("No requirement_slots found for SY %s — falling back to legacy school_year_requirements", student.school_year_id)
    return await _legacy_syrs_as_slots(db, student)


def _filter_slots_by_classification(
    slots: list[RequirementSlot],
    classification,
) -> list[RequirementSlot]:
    """Remove slots whose *only* item document types don't apply to the student."""
    if classification is None:
        return slots

    filtered: list[RequirementSlot] = []
    for slot in slots:
        keep = False
        for item in slot.items:
            applicable = item.document_type.applicable_classifications or []
            if not applicable or classification.value in applicable:
                keep = True
                break
        if keep:
            filtered.append(slot)
    return filtered


async def _legacy_syrs_as_slots(db: SessionDep, student: Student) -> list[RequirementSlot]:
    """Convert legacy SchoolYearRequirement rows into synthetic RequirementSlot objects."""
    stmt = (
        select(SchoolYearRequirement)
        .options(selectinload(SchoolYearRequirement.document_type))
        .where(SchoolYearRequirement.school_year_id == student.school_year_id)
        .order_by(SchoolYearRequirement.created_at, SchoolYearRequirement.id)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    slots: list[RequirementSlot] = []
    for idx, row in enumerate(rows):
        doc_type = row.document_type
        applicable = doc_type.applicable_classifications or []
        if student.classification and applicable and student.classification.value not in applicable:
            continue

        slot = RequirementSlot(
            id=row.id,
            school_year_id=row.school_year_id,
            slot_type="solo",
            min_required=1,
            display_order=idx,
            snapshot_fields_json=row.snapshot_fields_json,
        )
        item = RequirementSlotItem(
            id=row.id,
            requirement_slot_id=row.id,
            document_type_id=row.document_type_id,
            extraction_schema_id=row.extraction_schema_id,
            is_primary=True,
            display_order=0,
        )
        item.document_type = doc_type
        slot.items = [item]
        slots.append(slot)

    return slots


# ── Dynamic slot resolution for student checklist ──────────────────────


async def get_student_slot_statuses(
    db: SessionDep,
    student: Student,
) -> list[SlotStatusResponse]:
    """
    Dynamic Inventory Resolution Engine.

    1. Fetches all slots (with items) for the student's school year,
       filtered by classification.
    2. Fetches the student's approved (classified / submitted / in_review /
       verified) ``DocumentSubmission`` rows.
    3. For each slot, evaluates whether enough matching submissions exist
       to satisfy ``min_required``.

    Because a single submission can match multiple slots' items, one
    uploaded Birth Certificate can satisfy both "ID Proof" and "Citizenship
    Proof" simultaneously.
    """
    slots = await get_requirement_slots_for_student(db, student)

    if not slots:
        return []

    # Fetch all approved submissions for this student, excluding those
    # superseded by a replacement (old submissions whose id appears as
    # another submission's parent_submission_id).  Replacement submissions
    # themselves (new ones with parent_submission_id set) are kept.
    approved_statuses = (
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
        SubmissionStatus.VERIFIED,
    )
    replaced_subq = (
        select(DocumentSubmission.parent_submission_id)
        .where(DocumentSubmission.parent_submission_id.isnot(None))
    ).scalar_subquery()
    sub_stmt = (
        select(DocumentSubmission)
        .where(
            DocumentSubmission.student_id == student.id,
            DocumentSubmission.status.in_(approved_statuses),
            DocumentSubmission.id.notin_(replaced_subq),
        )
    )
    submissions = list((await db.execute(sub_stmt)).scalars().all())

    # Build inventory map: document_type_id → list of statuses
    inventory: dict[UUID, list[str]] = {}
    for sub in submissions:
        dt_id = sub.document_type_id
        if dt_id is None:
            continue
        inventory.setdefault(dt_id, []).append(sub.status.value)

    statuses: list[SlotStatusResponse] = []
    for slot in slots:
        matched_sub_ids: list[UUID] = []
        matched_count = 0
        verified_count = 0
        matched_doc_names: list[str] = []
        slot_item_dtos: list[SlotItemStatus] = []

        for item in slot.items:
            dt = item.document_type
            slot_item_dtos.append(
                SlotItemStatus(
                    document_type_id=item.document_type_id,
                    document_type_name=dt.name if dt else "Unknown",
                    document_type_code=dt.code if dt else "",
                    is_primary=item.is_primary,
                )
            )
            # Count approved submissions for this document type
            approved_for_type = [
                status for status in inventory.get(item.document_type_id, [])
                if status in ("classified", "submitted", "in-review", "verified")
            ]
            if approved_for_type:
                matched_count += 1
                matched_doc_names.append(dt.name if dt else "Unknown")
                seen_ids: set[UUID] = set()
                for sub in submissions:
                    if str(sub.document_type_id) == str(item.document_type_id):
                        if sub.id not in seen_ids:
                            seen_ids.add(sub.id)
                            matched_sub_ids.append(sub.id)
            verified_for_type = [
                status for status in inventory.get(item.document_type_id, [])
                if status == "verified"
            ]
            if verified_for_type:
                verified_count += 1

        # For solo slots, duplicates are the submissions beyond min_required
        duplicate_sub_ids: list[UUID] = []
        if slot.slot_type == "solo" and len(matched_sub_ids) > slot.min_required:
            duplicate_sub_ids = matched_sub_ids[slot.min_required:]

        statuses.append(
            SlotStatusResponse(
                id=slot.id,
                slot_type=slot.slot_type,
                group_name=slot.group_name,
                description=slot.description,
                min_required=slot.min_required,
                display_order=slot.display_order,
                items=slot_item_dtos,
                is_complete=matched_count >= slot.min_required,
                matched_submission_ids=matched_sub_ids,
                duplicate_submission_ids=duplicate_sub_ids,
                matched_count=matched_count,
                matched_document_type_names=matched_doc_names,
                verified_count=verified_count,
            )
        )

    return statuses


# ── Bulk slot resolution (avoids N+1 queries in student lists) ──────────

def _legacy_rows_to_slots(rows: list[SchoolYearRequirement]) -> list[RequirementSlot]:
    """Convert legacy SchoolYearRequirement rows to synthetic RequirementSlot
    objects **without** classification filtering (filtering is applied per
    student later by ``_filter_slots_by_classification``)."""
    slots: list[RequirementSlot] = []
    for idx, row in enumerate(rows):
        doc_type = row.document_type
        slot = RequirementSlot(
            id=row.id,
            school_year_id=row.school_year_id,
            slot_type="solo",
            min_required=1,
            display_order=idx,
            snapshot_fields_json=row.snapshot_fields_json,
        )
        item = RequirementSlotItem(
            id=row.id,
            requirement_slot_id=row.id,
            document_type_id=row.document_type_id,
            extraction_schema_id=row.extraction_schema_id,
            is_primary=True,
            display_order=0,
        )
        item.document_type = doc_type
        slot.items = [item]
        slots.append(slot)
    return slots


async def get_bulk_student_slot_statuses(
    db: SessionDep,
    students: list[Student],
) -> dict[UUID, list[SlotStatusResponse]]:
    """Batched version of ``get_student_slot_statuses`` for use in loops.

    Instead of calling ``get_student_slot_statuses`` once per student
    (N+1 queries), this function runs **3-6 queries total** regardless of
    how many students are in the list:

    1. Pre-fetches all slots for each unique school year (1 query per SY).
    2. Bulk-fetches all approved submissions for all students (1 query).
    3. Computes statuses per student **in memory** — no further DB calls.

    Returns a dict mapping ``student_id`` → ``list[SlotStatusResponse]``.
    Students with no school year or no matching slots get an empty list.
    The logic is identical to ``get_student_slot_statuses`` — only the
    data-fetching strategy differs.
    """
    if not students:
        return {}

    # ── 1. Pre-fetch slots per school year ─────────────────────────
    sy_ids = list({
        s.school_year_id for s in students
        if s.school_year_id is not None
    })

    sy_slots: dict[UUID, list[RequirementSlot]] = {}
    for sy_id in sy_ids:
        stmt = (
            select(RequirementSlot)
            .where(RequirementSlot.school_year_id == sy_id)
            .order_by(RequirementSlot.display_order)
            .options(
                selectinload(RequirementSlot.items).selectinload(
                    RequirementSlotItem.document_type),
                selectinload(RequirementSlot.items).selectinload(
                    RequirementSlotItem.extraction_schema),
            )
        )
        slots = list((await db.execute(stmt)).scalars().all())

        if not slots:
            # Legacy fallback — fetch SchoolYearRequirement rows for
            # this school year and convert to synthetic slots
            legacy_stmt = (
                select(SchoolYearRequirement)
                .options(selectinload(SchoolYearRequirement.document_type))
                .where(SchoolYearRequirement.school_year_id == sy_id)
                .order_by(
                    SchoolYearRequirement.created_at,
                    SchoolYearRequirement.id,
                )
            )
            legacy_rows = list((await db.execute(legacy_stmt)).scalars().all())
            slots = _legacy_rows_to_slots(legacy_rows)

        sy_slots[sy_id] = slots

    # ── 2. Bulk-fetch all eligible submissions ──────────────────────
    approved_statuses = (
        SubmissionStatus.CLASSIFIED,
        SubmissionStatus.SUBMITTED,
        SubmissionStatus.IN_REVIEW,
        SubmissionStatus.VERIFIED,
    )
    replaced_subq = (
        select(DocumentSubmission.parent_submission_id)
        .where(DocumentSubmission.parent_submission_id.isnot(None))
    ).scalar_subquery()

    student_ids = [s.id for s in students]
    sub_stmt = (
        select(DocumentSubmission)
        .where(
            DocumentSubmission.student_id.in_(student_ids),
            DocumentSubmission.status.in_(approved_statuses),
            DocumentSubmission.id.notin_(replaced_subq),
        )
    )
    all_subs = list((await db.execute(sub_stmt)).scalars().all())

    # Partition submissions by student
    subs_by_student: dict[UUID, list[DocumentSubmission]] = {}
    for sub in all_subs:
        subs_by_student.setdefault(sub.student_id, []).append(sub)

    # ── 3. Compute statuses per student (in memory) ─────────────────
    result: dict[UUID, list[SlotStatusResponse]] = {}
    for student in students:
        sy_id = student.school_year_id
        if sy_id is None:
            result[student.id] = []
            continue

        slots = _filter_slots_by_classification(
            sy_slots.get(sy_id, []), student.classification,
        )
        if not slots:
            result[student.id] = []
            continue

        student_subs = subs_by_student.get(student.id, [])

        # Build inventory: document_type_id → [status, ...]
        inventory: dict[UUID, list[str]] = {}
        for sub in student_subs:
            dt_id = sub.document_type_id
            if dt_id is None:
                continue
            inventory.setdefault(dt_id, []).append(sub.status.value)

        statuses: list[SlotStatusResponse] = []
        for slot in slots:
            matched_sub_ids: list[UUID] = []
            matched_count = 0
            verified_count = 0
            slot_item_dtos: list[SlotItemStatus] = []

            for item in slot.items:
                dt = item.document_type
                slot_item_dtos.append(
                    SlotItemStatus(
                        document_type_id=item.document_type_id,
                        document_type_name=dt.name if dt else "Unknown",
                        document_type_code=dt.code if dt else "",
                        is_primary=item.is_primary,
                    )
                )
                approved_for_type = [
                    status
                    for status in inventory.get(item.document_type_id, [])
                    if status in ("classified", "submitted", "in-review", "verified")
                ]
                if approved_for_type:
                    matched_count += 1
                    seen_ids: set[UUID] = set()
                    for sub in student_subs:
                        if str(sub.document_type_id) == str(item.document_type_id):
                            if sub.id not in seen_ids:
                                seen_ids.add(sub.id)
                                matched_sub_ids.append(sub.id)
                verified_for_type = [
                    status
                    for status in inventory.get(item.document_type_id, [])
                    if status == "verified"
                ]
                if verified_for_type:
                    verified_count += 1

            statuses.append(
                SlotStatusResponse(
                    id=slot.id,
                    slot_type=slot.slot_type,
                    group_name=slot.group_name,
                    description=slot.description,
                    min_required=slot.min_required,
                    display_order=slot.display_order,
                    items=slot_item_dtos,
                    is_complete=matched_count >= slot.min_required,
                    matched_submission_ids=matched_sub_ids,
                    matched_count=matched_count,
                    verified_count=verified_count,
                )
            )

        result[student.id] = statuses

    return result


# ── Dual-write: admin saves slots to both old and new tables ────────────


async def replace_requirement_slots(
    db: SessionDep,
    school_year_id: UUID,
    slots_data: list[dict],
) -> list[RequirementSlot]:
    """
    Dual-write strategy.

    Writes slot assignments to **both** the new ``requirement_slots`` /
    ``requirement_slot_items`` tables **and** the legacy
    ``school_year_requirements`` table so existing code (analytics, adviser
    dashboard, etc.) continues to work during the transition.

    Also snapshots ``fields_json`` from assigned schemas for analytics
    stability.
    """
    await ensure_slots_mutable(db, school_year_id)

    # ── Validate document type IDs ──────────────────────────────────
    all_doc_type_ids: set[UUID] = set()
    for slot_data in slots_data:
        for item_data in slot_data.get("items", []):
            all_doc_type_ids.add(item_data["document_type_id"])

    if all_doc_type_ids:
        dt_stmt = select(DocumentType.id).where(
            DocumentType.id.in_(all_doc_type_ids),
            DocumentType.status.in_([DocumentTypeStatus.ACTIVE, DocumentTypeStatus.ARCHIVED]),
        )
        found_ids = set((await db.execute(dt_stmt)).scalars().all())
        missing = all_doc_type_ids - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more document types are missing or not active.",
            )

    # ── Validate schema IDs ─────────────────────────────────────────
    all_schema_ids: set[UUID] = set()
    for slot_data in slots_data:
        for item_data in slot_data.get("items", []):
            sid = item_data.get("extraction_schema_id")
            if sid:
                all_schema_ids.add(sid)

    if all_schema_ids:
        schema_stmt = select(ExtractionSchema.id).where(
            ExtractionSchema.id.in_(all_schema_ids),
            ExtractionSchema.status != ExtractionSchemaStatus.ARCHIVED,
        )
        found_schemas = set((await db.execute(schema_stmt)).scalars().all())
        missing = all_schema_ids - found_schemas
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more extraction schemas are missing or archived.",
            )

    # ── Delete existing slots for this school year ───────────────────
    await db.execute(
        delete(RequirementSlot).where(RequirementSlot.school_year_id == school_year_id)
    )

    # ── Write to legacy table (dual-write) ──────────────────────────
    await db.execute(
        delete(SchoolYearRequirement).where(SchoolYearRequirement.school_year_id == school_year_id)
    )
    legacy_docs_seen: set[UUID] = set()
    for slot_data in slots_data:
        for item_data in slot_data.get("items", []):
            dt_id = item_data["document_type_id"]
            if dt_id in legacy_docs_seen:
                continue
            legacy_docs_seen.add(dt_id)

            schema_id = item_data.get("extraction_schema_id")
            snapshot = None
            if schema_id:
                schema = await db.get(ExtractionSchema, schema_id)
                if schema:
                    snapshot = schema.fields_json

            db.add(
                SchoolYearRequirement(
                    school_year_id=school_year_id,
                    document_type_id=dt_id,
                    extraction_schema_id=schema_id,
                    snapshot_fields_json=snapshot,
                )
            )

    # ── Write new slots ─────────────────────────────────────────────
    created_slots: list[RequirementSlot] = []
    for slot_data in slots_data:
        group_name = slot_data.get("group_name") or None
        if group_name:
            group_name = group_name.strip() or None

        slot = RequirementSlot(
            school_year_id=school_year_id,
            slot_type=slot_data["slot_type"],
            group_name=group_name,
            description=slot_data.get("description"),
            min_required=slot_data.get("min_required", 1),
            display_order=slot_data.get("display_order", 0),
        )
        db.add(slot)
        await db.flush()

        for item_data in slot_data.get("items", []):
            sid = item_data.get("extraction_schema_id")
            item = RequirementSlotItem(
                requirement_slot_id=slot.id,
                document_type_id=item_data["document_type_id"],
                extraction_schema_id=sid,
                is_primary=item_data.get("is_primary", False),
                display_order=item_data.get("display_order", 0),
            )
            db.add(item)

        primary_item = next(
            (i for i in slot_data.get("items", []) if i.get("is_primary")),
            slot_data.get("items", [None])[0],
        )
        snapshot = None
        if primary_item:
            primary_sid = primary_item.get("extraction_schema_id")
            if primary_sid:
                schema = await db.get(ExtractionSchema, primary_sid)
                if schema:
                    snapshot = schema.fields_json
        slot.snapshot_fields_json = snapshot
        created_slots.append(slot)

    await db.flush()
    await db.commit()
    return created_slots


async def list_requirement_slots(
    db: SessionDep,
    school_year_id: UUID,
) -> list[SlotResponse]:
    """List all slots for a school year with their items, for the admin UI."""
    await get_school_year_or_404(db, school_year_id)

    stmt = (
        select(RequirementSlot)
        .where(RequirementSlot.school_year_id == school_year_id)
        .order_by(RequirementSlot.display_order)
        .options(
            selectinload(RequirementSlot.items).selectinload(RequirementSlotItem.document_type),
            selectinload(RequirementSlot.items).selectinload(RequirementSlotItem.extraction_schema),
        )
    )
    slots = list((await db.execute(stmt)).scalars().all())

    return [_slot_to_response(slot) for slot in slots]


def _slot_to_response(slot: RequirementSlot) -> SlotResponse:
    return SlotResponse(
        id=slot.id,
        school_year_id=slot.school_year_id,
        slot_type=slot.slot_type,
        group_name=slot.group_name,
        description=slot.description,
        min_required=slot.min_required,
        display_order=slot.display_order,
        items=[
            SlotItemResponse(
                id=item.id,
                requirement_slot_id=slot.id,
                document_type_id=item.document_type_id,
                document_type_name=item.document_type.name if item.document_type else "Unknown",
                document_type_code=item.document_type.code if item.document_type else "",
                extraction_schema_id=item.extraction_schema_id,
                extraction_schema_name=item.extraction_schema.name if item.extraction_schema else None,
                is_primary=item.is_primary,
                display_order=item.display_order,
            )
            for item in (slot.items or [])
        ],
    )
