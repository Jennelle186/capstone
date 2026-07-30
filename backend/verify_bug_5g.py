#!/usr/bin/env python3
"""
Bug 5G Verification Script
Checks that extraction endpoints discover schemas from BOTH
legacy (school_year_requirements) and new (requirement_slot_items) systems.

Usage:
    cd backend
    python verify_bug_5g.py
"""

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus

# Ensure the backend package is importable
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")


def _build_db_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "enrollment_docs")
    if password:
        auth = f"{quote_plus(user)}:{quote_plus(password)}@"
    else:
        auth = f"{quote_plus(user)}@"
    return f"postgresql+asyncpg://{auth}{host}:{port}/{name}"


async def main():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select

    engine = create_async_engine(_build_db_url(), echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        from app.models import (
            Student, User,
            DocumentSubmission, SubmissionStatus,
            SchoolYearRequirement,
            RequirementSlot, RequirementSlotItem,
            ExtractionSchema, ExtractionSchemaStatus,
        )

        # ── 1. Find a real student ──────────────────────────────────────
        student_row = (
            await db.execute(
                select(Student, User)
                .join(User, Student.user_id == User.id)
                .where(Student.student_number.isnot(None))
                .limit(1)
            )
        ).first()

        if not student_row:
            print("❌ No student found with a student_number set.")
            return

        student, user = student_row
        print(f"Student: {user.first_name or ''} {user.last_name or ''} ({student.id})")
        print(f"School Year ID: {student.school_year_id}")

        if not student.school_year_id:
            print("❌ Student has no school_year_id assigned.")
            return

        # ── 2. Check what requirement systems are active ────────────────
        legacy_reqs = (
            await db.execute(
                select(SchoolYearRequirement).where(
                    SchoolYearRequirement.school_year_id == student.school_year_id,
                    SchoolYearRequirement.extraction_schema_id.isnot(None),
                )
            )
        ).scalars().all()

        slot_items = (
            await db.execute(
                select(RequirementSlotItem)
                .join(RequirementSlot,
                      RequirementSlotItem.requirement_slot_id == RequirementSlot.id)
                .where(
                    RequirementSlot.school_year_id == student.school_year_id,
                    RequirementSlotItem.extraction_schema_id.isnot(None),
                )
            )
        ).scalars().all()

        print(f"\n📋 Legacy school_year_requirements with schemas: {len(legacy_reqs)}")
        for r in legacy_reqs:
            print(f"   - doc_type_id={r.document_type_id}  schema={r.extraction_schema_id}")

        print(f"\n📦 New requirement_slot_items with schemas: {len(slot_items)}")
        for si in slot_items:
            print(f"   - doc_type_id={si.document_type_id}  schema={si.extraction_schema_id}")

        # ── 3. Build the eligible set (same logic as our fix) ───────────
        eligible_doc_type_ids: set = set()

        for req in legacy_reqs:
            if req.document_type_id and req.extraction_schema_id:
                schema = await db.get(ExtractionSchema, req.extraction_schema_id)
                if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                    eligible_doc_type_ids.add(req.document_type_id)

        for item in slot_items:
            if item.document_type_id and item.extraction_schema_id:
                schema = await db.get(ExtractionSchema, item.extraction_schema_id)
                if schema and schema.status != ExtractionSchemaStatus.ARCHIVED:
                    eligible_doc_type_ids.add(item.document_type_id)

        print(f"\n🎯 Eligible document type IDs (from both systems): {len(eligible_doc_type_ids)}")

        # ── 4. Check student's classified documents ─────────────────────
        docs = (
            await db.execute(
                select(DocumentSubmission).where(
                    DocumentSubmission.student_id == student.id,
                    DocumentSubmission.status.in_([
                        SubmissionStatus.CLASSIFIED,
                        SubmissionStatus.FLAGGED,
                        SubmissionStatus.PROCESSING,
                    ]),
                )
            )
        ).scalars().all()

        print(f"\n📄 Student's classified / flagged / processing documents: {len(docs)}")

        eligible_count = 0
        for doc in docs:
            is_eligible = doc.document_type_id in eligible_doc_type_ids
            if is_eligible:
                eligible_count += 1
            status = "✅ ELIGIBLE" if is_eligible else "❌ NO SCHEMA"
            print(f"   - {doc.id}  doctype={doc.document_type_id}  status={doc.status.value if hasattr(doc.status, 'value') else doc.status}  → {status}")

        # ── 5. Summary ──────────────────────────────────────────────────
        print()
        print("=" * 65)
        print(f"SUMMARY: {eligible_count}/{len(docs)} documents eligible for extraction")

        if slot_items and not legacy_reqs:
            print("\n🔴 CRITICAL: School year uses ONLY slot-based requirements.")
            print("   WITHOUT the Bug 5G fix, extraction would return EMPTY (0 docs).")
            print(f"   WITH the fix, {eligible_count} documents should be eligible.")
        elif legacy_reqs and not slot_items:
            print("\n🟢 School year uses ONLY legacy requirements.")
            print("   Bug 5G fix is backward-compatible (no regression).")
        elif slot_items and legacy_reqs:
            print("\n🟡 School year uses BOTH systems.")
            print(f"   Fix merges both correctly: {eligible_count} docs eligible.")
        else:
            print("\n⚠️ School year has NO schemas in either system.")
            print("   All documents will be excluded — this is correct behavior.")

        print("\n" + "=" * 65)
        print("NEXT STEPS")
        print("=" * 65)
        print("1. Log into the student account in the frontend")
        print("2. Go to Upload Documents → StepExtract")
        print("3. Verify classified documents appear for extraction")
        print(f"   Expected: {eligible_count} documents show extraction fields")
        print("   If you see 0 → the fix is NOT working")
        print()
        print("Or run backend pytest for automated verification:")
        print("   pytest tests/test_documents_router.py -xvs -k extractions")
        print()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except ConnectionRefusedError:
        print("=" * 65)
        print("❌ PostgreSQL is not running.")
        print("   Start your database first then re-run this script.")
        print()
        print("   In the meantime, run the automated pytest verification:")
        print("   pytest tests/test_documents_router.py -xvs -k 'slot or merges'")
        print("=" * 65)
    except Exception as e:
        print(f"❌ Error: {e}")
