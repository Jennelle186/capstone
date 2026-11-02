"""Setup checklist status for the admin dashboard.

The rules live in ``build_setup_status`` (pure, easy to test). ``get_setup_status``
only runs the counting queries and passes the numbers to that function.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select

from ..database import SessionDep
from ..models import (
    BrandingSettings,
    Department,
    DocumentType,
    DocumentTypeStatus,
    ExtractionSchema,
    ExtractionSchemaStatus,
    Form,
    ProgramAdviserAssignment,
    RequirementSlot,
    SchoolYear,
    SchoolYearRequirement,
)
from ..schemas.admin_setup_status import AdminSetupStatusResponse, SetupStep
from .helpers import get_active_school_year_id


@dataclass(frozen=True)
class SetupCounts:
    active_school_year_name: str | None
    active_programs: int
    advisers_assigned_this_year: int
    active_document_types_with_classifications: int
    active_schemas: int
    requirements_this_year: int
    branding_name_set: bool
    forms: int


def requirements_for_year(slot_rows: int, legacy_rows: int) -> int:
    """Count requirements for the active year without double counting.

    Saving requirements writes a legacy row per document type and a slot per requirement, so the
    two overlap. Slots are the model the admin edits, so they are counted when any exist. Years
    saved before slots existed have only legacy rows, which are counted instead.
    """
    return slot_rows if slot_rows > 0 else legacy_rows


def build_setup_status(counts: SetupCounts) -> AdminSetupStatusResponse:
    """Turn counts into checklist steps. Required steps decide ``core_complete``;
    optional steps are reported but never block it."""
    has_school_year = counts.active_school_year_name is not None
    steps = [
        SetupStep(key="school_year", done=has_school_year, count=1 if has_school_year else 0, required=True),
        SetupStep(key="programs", done=counts.active_programs > 0, count=counts.active_programs, required=True),
        SetupStep(
            key="advisers",
            done=counts.advisers_assigned_this_year > 0,
            count=counts.advisers_assigned_this_year,
            required=True,
        ),
        SetupStep(
            key="document_types",
            done=counts.active_document_types_with_classifications > 0,
            count=counts.active_document_types_with_classifications,
            required=True,
        ),
        SetupStep(key="schemas", done=counts.active_schemas > 0, count=counts.active_schemas, required=True),
        SetupStep(
            key="requirements",
            done=counts.requirements_this_year > 0,
            count=counts.requirements_this_year,
            required=True,
        ),
        SetupStep(key="branding", done=counts.branding_name_set, count=1 if counts.branding_name_set else 0, required=False),
        SetupStep(key="forms", done=counts.forms > 0, count=counts.forms, required=False),
    ]
    core_complete = all(step.done for step in steps if step.required)
    return AdminSetupStatusResponse(
        active_school_year_name=counts.active_school_year_name,
        core_complete=core_complete,
        steps=steps,
    )


async def get_setup_status(db: SessionDep) -> AdminSetupStatusResponse:
    active_id = await get_active_school_year_id(db)
    active_name = None
    advisers = 0
    requirements = 0
    if active_id is not None:
        active_name = (await db.execute(select(SchoolYear.name).where(SchoolYear.id == active_id))).scalar_one_or_none()
        advisers = (
            await db.execute(
                select(func.count(func.distinct(ProgramAdviserAssignment.adviser_id))).where(
                    ProgramAdviserAssignment.school_year_id == active_id
                )
            )
        ).scalar_one()
        requirement_rows = (
            await db.execute(
                select(func.count()).select_from(SchoolYearRequirement).where(
                    SchoolYearRequirement.school_year_id == active_id
                )
            )
        ).scalar_one()
        slot_rows = (
            await db.execute(
                select(func.count()).select_from(RequirementSlot).where(RequirementSlot.school_year_id == active_id)
            )
        ).scalar_one()
        requirements = requirements_for_year(slot_rows, requirement_rows)

    programs = (
        await db.execute(select(func.count()).select_from(Department).where(Department.is_active.is_(True)))
    ).scalar_one()

    # applicable_classifications is a JSON list; a document type only counts with at least one entry.
    document_types = (
        await db.execute(select(DocumentType.applicable_classifications).where(DocumentType.status == DocumentTypeStatus.ACTIVE))
    ).scalars().all()
    typed_documents = sum(1 for classifications in document_types if classifications)

    schemas = (
        await db.execute(
            select(func.count()).select_from(ExtractionSchema).where(ExtractionSchema.status == ExtractionSchemaStatus.ACTIVE)
        )
    ).scalar_one()

    branding_name = (
        await db.execute(select(BrandingSettings.institution_name).where(BrandingSettings.id == 1))
    ).scalar_one_or_none()

    forms = (await db.execute(select(func.count()).select_from(Form))).scalar_one()

    return build_setup_status(
        SetupCounts(
            active_school_year_name=active_name,
            active_programs=programs,
            advisers_assigned_this_year=advisers,
            active_document_types_with_classifications=typed_documents,
            active_schemas=schemas,
            requirements_this_year=requirements,
            branding_name_set=bool(branding_name and branding_name.strip()),
            forms=forms,
        )
    )
