"""
Add 3 test students to BSCS (S.Y. 2026-2027) for the adviser yawashopee24@gmail.com.
Students start as Freshman (DB default). Idempotent — safe to re-run.

Usage:
    cd backend && .venv\Scripts\activate && python add_test_students.py
"""

import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    User, UserRole, Student, DocumentSubmission,
    DocumentSubmissionHistory, SubmissionStatus,
)

SCHOOL_YEAR_ID = uuid.UUID("874708d7-8331-4b1e-97cd-aeaaaa8e1916")
BSCS_DEPT_ID = uuid.UUID("fb1e9425-5d3c-4098-bb7b-96240c00cab5")
ADMISSION_FORM_DOC_TYPE = uuid.UUID("6485d382-ced9-4774-b88c-720545292ce4")

TEST_USERS = [
    {
        "clerk_id": "test_student_bscs_01",
        "email": "test.bscs.01@sample.edu.ph",
        "first_name": "Juan",
        "last_name": "Test",
        "student_number": "2026-BSCS-TEST01",
    },
    {
        "clerk_id": "test_student_bscs_02",
        "email": "test.bscs.02@sample.edu.ph",
        "first_name": "Maria",
        "last_name": "Test",
        "student_number": "2026-BSCS-TEST02",
    },
    {
        "clerk_id": "test_student_bscs_03",
        "email": "test.bscs.03@sample.edu.ph",
        "first_name": "Pedro",
        "last_name": "Test",
        "student_number": "2026-BSCS-TEST03",
    },
]


async def main():
    async with AsyncSessionLocal() as db:
        created = 0
        skipped = 0

        for info in TEST_USERS:
            existing = await db.execute(
                select(User.id).where(User.clerk_user_id == info["clerk_id"])
            )
            if existing.scalar_one_or_none():
                print(f"  SKIP: {info['clerk_id']} (already exists)")
                skipped += 1
                continue

            user = User(
                clerk_user_id=info["clerk_id"],
                email=info["email"],
                first_name=info["first_name"],
                last_name=info["last_name"],
                role=UserRole.STUDENT,
            )
            db.add(user)
            await db.flush()

            student = Student(
                user_id=user.id,
                school_year_id=SCHOOL_YEAR_ID,
                student_number=info["student_number"],
                program_id=BSCS_DEPT_ID,
            )
            db.add(student)
            await db.flush()

            upload_ts = datetime.now(timezone.utc) - timedelta(days=1)
            sub_id = uuid.uuid4()

            db.add(DocumentSubmission(
                id=sub_id,
                student_id=student.id,
                file_key=f"test-data/{info['student_number']}_Admission_Form.pdf",
                original_filename=f"{info['student_number']}_Admission_Form.pdf",
                file_size="1024000",
                mime_type="application/pdf",
                status=SubmissionStatus.UPLOADED,
                document_type_id=ADMISSION_FORM_DOC_TYPE,
                created_at=upload_ts,
                updated_at=upload_ts,
            ))
            db.add(DocumentSubmissionHistory(
                submission_id=sub_id,
                action="UPLOADED",
                previous_status="pending",
                new_status="uploaded",
                created_at=upload_ts,
            ))

            created += 1
            print(f"  CREATED: {info['student_number']} (classification: Freshman)")

        await db.commit()
        print(f"\nDone: {created} created, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(main())
