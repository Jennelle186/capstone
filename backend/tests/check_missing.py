"""
Check which students in the active school year are missing general_average
computed data — either no stored value AND no computable dependencies.
"""

import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    DocumentSubmission,
    DocumentType,
    ExtractionSchema,
    SchoolYear,
    SchoolYearRequirement,
    Student,
    SubmissionStatus,
    User,
)


def _debug_ed(ed: dict, ga_id, sem1_id, sem2_id) -> str:
    """Return a one-line summary of what the script found in extracted_data."""
    parts: list[str] = []

    has_ga_direct = bool(ga_id and ga_id in ed)
    has_ga_source = False
    if not has_ga_direct:
        for _v in ed.values():
            if isinstance(_v, dict) and _v.get("source_key") == "general_average":
                has_ga_source = True
                break
    parts.append(f"ga_direct={'Y' if has_ga_direct else 'N'}")
    parts.append(f"ga_source={'Y' if has_ga_source else 'N'}")

    s1_ok = False
    if sem1_id:
        d = ed.get(sem1_id, {})
        s1_ok = isinstance(d, dict) and d.get("value", "") != ""
    parts.append(f"sem1={'Y' if s1_ok else 'N'}")

    s2_ok = False
    if sem2_id:
        d = ed.get(sem2_id, {})
        s2_ok = isinstance(d, dict) and d.get("value", "") != ""
    parts.append(f"sem2={'Y' if s2_ok else 'N'}")

    # Show how many entries are in extracted_data (excluding _ocr_text etc)
    data_keys = [k for k in ed if not k.startswith("_")]
    parts.append(f"keys={len(data_keys)}")

    return "  ".join(parts)


async def main():
    async with AsyncSessionLocal() as db:
        sy = (await db.execute(
            select(SchoolYear).where(SchoolYear.is_active == True)
        )).scalar_one_or_none()
        if not sy:
            print("No active school year")
            return

        print(f"Active SY: {sy.name}  id={sy.id}")

        rc_dt = (await db.execute(
            select(DocumentType).where(DocumentType.code == "REPORT_CARD")
        )).scalar_one_or_none()
        if not rc_dt:
            print("REPORT_CARD doc type not found")
            return

        syr = (await db.execute(
            select(SchoolYearRequirement).where(
                SchoolYearRequirement.school_year_id == sy.id,
                SchoolYearRequirement.document_type_id == rc_dt.id,
                SchoolYearRequirement.extraction_schema_id.isnot(None),
            )
        )).scalar_one_or_none()
        if not syr:
            print("No SYR for REPORT_CARD in this SY")
            return

        schema = await db.get(ExtractionSchema, syr.extraction_schema_id)
        if not schema or not schema.fields_json:
            print("No schema or fields")
            return

        key_to_id: dict[str, str] = {}
        for f in schema.fields_json:
            k = f.get("key")
            fid = f.get("id")
            if k and fid:
                key_to_id[k] = fid

        ga_id = key_to_id.get("general_average")
        sem1_id = key_to_id.get("first_semester_average")
        sem2_id = key_to_id.get("second_semester_average")
        print(f"general_average        id = {ga_id}")
        print(f"first_semester_average  id = {sem1_id}")
        print(f"second_semester_average id = {sem2_id}")

        subs = (await db.execute(
            select(DocumentSubmission).where(
                DocumentSubmission.document_type_id == rc_dt.id,
                DocumentSubmission.status == SubmissionStatus.VERIFIED,
                DocumentSubmission.student_id.in_(
                    select(Student.id).where(Student.school_year_id == sy.id)
                ),
            )
        )).scalars().all()

        print(f"\nVerified REPORT_CARD submissions: {len(subs)}")

        # Debug: show every submission's extracted_data summary
        print("\n=== Debug: extracted_data per submission ===")
        students_all = (await db.execute(
            select(Student).where(Student.school_year_id == sy.id)
        )).scalars().all()
        student_map = {s.id: s for s in students_all}

        user_ids = [s.user_id for s in students_all]
        users_list = (await db.execute(
            select(User).where(User.id.in_(user_ids))
        )).scalars().all()
        user_map = {u.id: u for u in users_list}

        missing: list[tuple] = []
        for idx, sub in enumerate(subs):
            ed = sub.extracted_data or {}
            student = student_map.get(sub.student_id)
            user = user_map.get(student.user_id) if student else None
            name = f"{user.first_name} {user.last_name}" if user else "Unknown"
            debug = _debug_ed(ed, ga_id, sem1_id, sem2_id)
            print(f"  [{idx+1:02d}] {name:30s}  {debug}")

            has_ga = False
            if ga_id and ga_id in ed:
                has_ga = True
            if not has_ga and ga_id:
                for _v in ed.values():
                    if isinstance(_v, dict) and _v.get("source_key") == "general_average":
                        has_ga = True
                        break

            can_compute = False
            if not has_ga:
                deps: list[float] = []
                for did in (sem1_id, sem2_id):
                    if not did:
                        continue
                    d = ed.get(did, {})
                    val = d.get("value") if isinstance(d, dict) else None
                    if val is not None and val != "":
                        try:
                            deps.append(float(val))
                        except (ValueError, TypeError):
                            pass
                can_compute = len(deps) > 0

            if not has_ga and not can_compute:
                missing.append((user, student, sub))

        print(f"\nMissing general_average (no stored value AND no computable deps): {len(missing)}")
        for user, student, sub in missing:
            name = f"{user.first_name} {user.last_name}" if user else "Unknown"
            sn = f"({student.student_number})" if student else ""
            print(f"  {name} {sn}")

        # Students with NO verified report card at all
        all_student_ids = {s.id for s in students_all}
        sub_student_ids = {s.student_id for s in subs}
        no_rc_ids = all_student_ids - sub_student_ids
        if no_rc_ids:
            print(f"\nStudents with NO verified report card: {len(no_rc_ids)}")
            for sid in no_rc_ids:
                student = student_map[sid]
                user = user_map.get(student.user_id)
                name = f"{user.first_name} {user.last_name}" if user else "Unknown"
                print(f"  {name} ({student.student_number})")


if __name__ == "__main__":
    asyncio.run(main())
