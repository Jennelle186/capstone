"""
Seed 120 sample students (30 per department) with varying document submissions
across the 2026-2027 school year for testing the adviser DocumentReviewDesk,
dashboard, and analytics views.

Usage:
    cd backend && python seed_sample_data.py
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete as sa_delete, select as sa_select, text as sa_text

from app.database import AsyncSessionLocal
from app.models import (
    DocumentSubmission,
    DocumentSubmissionHistory,
    Job,
    JobSubmission,
    JobSubmissionItemStatus,
    JobResult,
    JobStatus,
    Student,
    StudentClassification,
    SubmissionStatus,
    User,
    UserRole,
)

random.seed(42)

# ─── Hardcoded UUIDs from the existing database ──────────────────────────

SCHOOL_YEAR_ID = uuid.UUID("27f1362d-41c5-4266-b9a7-cfa09d8297ed")  # 2026-2027

DEPARTMENTS = {
    "ACT-NT": uuid.UUID("93786b9f-1c77-48a7-bcdd-fc6c0795e142"),
    "BSIT": uuid.UUID("ba6282a3-f1ee-4b98-97cf-6f9618509b3e"),
    "ACT-AD": uuid.UUID("d2ac72f3-72ad-4220-8559-b699eb3e6de2"),
    "BSCS": uuid.UUID("fb1e9425-5d3c-4098-bb7b-96240c00cab5"),
}

DOC_TYPE_IDS = {
    "ADMISSION_FORM": uuid.UUID("6485d382-ced9-4774-b88c-720545292ce4"),
    "CET": uuid.UUID("786bbc68-2acf-4335-9c84-ecc628b37480"),
    "REPORT_CARD": uuid.UUID("a11f57da-36eb-43da-934e-57482a4b43e1"),
    "BIRTH_CERT": uuid.UUID("825acaae-3a0d-412b-bd8c-9d26ce8eff1b"),
    "GOOD_MORAL_CERT": uuid.UUID("c8985bdb-8c0e-445b-8642-2b6711e3041c"),
    "MED_CERT": uuid.UUID("27f6c8f3-6730-4005-ad6d-b6bb4bbdf9ed"),
    "TOR": uuid.UUID("a03de14d-878a-4443-8819-4dcef06aae67"),
    "ITR": uuid.UUID("0f5a4a28-1266-4c19-a570-88bdc53748d3"),
    "TAX_EXEMPT": uuid.UUID("8d844982-ac78-44b7-9c1f-15c41e6856db"),
    "AFFIDAVIT_NO_INCOME": uuid.UUID("75545c3c-2175-44a5-a455-57ab68b5cefd"),
    "INDIGENCY": uuid.UUID("6d39c76e-5c04-4350-adf3-506eb86872d8"),
}

FINANCIAL_DOCS = ["ITR", "TAX_EXEMPT", "AFFIDAVIT_NO_INCOME", "INDIGENCY"]

FRESHMAN_DOCS = [
    "ADMISSION_FORM", "CET", "REPORT_CARD", "BIRTH_CERT",
    "GOOD_MORAL_CERT", "MED_CERT",
]

TRANSFEREE_DOCS = [
    "ADMISSION_FORM", "CET", "TOR", "GOOD_MORAL_CERT", "MED_CERT",
]

DOC_NAMES = {
    "ADMISSION_FORM": "Admission_Form",
    "CET": "CET_Report_of_Rating",
    "REPORT_CARD": "Report_Card",
    "BIRTH_CERT": "Live_Birth_Certificate",
    "GOOD_MORAL_CERT": "Certificate_of_Good_Moral",
    "MED_CERT": "Medical_Certificate",
    "TOR": "Transcript_of_Records",
    "ITR": "Parents_Income_Tax_Return",
    "TAX_EXEMPT": "Certificate_of_Tax_Exemption",
    "AFFIDAVIT_NO_INCOME": "Affidavit_of_No_Income",
    "INDIGENCY": "Certificate_of_Indigency",
}

# ─── Name pools ──────────────────────────────────────────────────────────

FIRST_NAMES_F = [
    "Maria", "Ana", "Rosa", "Teresita", "Luzviminda", "Carmen", "Elena",
    "Gloria", "Imelda", "Josefina", "Lourdes", "Marlene", "Nenita",
    "Perlita", "Remedios", "Fe", "Corazon", "Leticia", "Milagros",
    "Norma", "Ofelia", "Pilar", "Rosario", "Salvacion", "Thelma",
    "Virginia", "Zenaida", "Cristina", "Diana", "Evelyn",
]
FIRST_NAMES_M = [
    "Jose", "Juan", "Pedro", "Carlos", "Eduardo", "Antonio", "Manuel",
    "Francisco", "Ramon", "Ricardo", "Fernando", "Gregorio", "Hilario",
    "Isidro", "Leonardo", "Mario", "Nicolas", "Orlando", "Pablo",
    "Rodrigo", "Santiago", "Teodoro", "Vicente", "Wilfredo",
    "Alberto", "Benjamin", "Cesar", "Dante", "Emilio", "Felipe",
]
LAST_NAMES = [
    "Santos", "Reyes", "Cruz", "Bautista", "Gonzales", "Mendoza",
    "Aquino", "Dela Cruz", "Garcia", "Rodriguez", "Martinez",
    "Fernandez", "Lopez", "Villanueva", "Torres", "Rivera",
    "Castillo", "Ramos", "Domingo", "Miranda", "Gutierrez",
    "Navarro", "Alcantara", "Velasco", "Serrano", "Lazaro",
    "Cortez", "Mercado", "Valdez", "Roldan",
]

REJECTION_REASONS = [
    "Illegible scan — text is too blurry to read",
    "Missing required signature on page 3",
    "Document appears expired — check issuance date",
    "Uploaded document is a photocopy, not original/PSA",
    "Incorrect document type submitted",
    "Name on document does not match student records",
    "Missing page 2 — incomplete submission",
    "Document is not authenticated by issuing authority",
]

SHS_SCHOOLS = [
    "Ateneo de Zamboanga University",
    "Western Mindanao State University",
    "Pilar College of Zamboanga City, Inc.",
    "Claret School of Zamboanga City",
    "Universidad de Zamboanga",
    "Zamboanga Chong Hua High School",
    "Immaculate Conception Archdiocesan School",
    "Southern City Colleges",
    "Arturo Eustaquio Memorial Science High School",
    "Ebenezer Bible College and Seminary",
]

ETHNICITY_OPTIONS = [
    "badjao", "manobo", "subanen", "sama", "yakan", "tausug",
    "maranao", "visayan", "zamboangueno", "tagalog", "maguindanaoan",
]
ETHNICITY_WEIGHTS = [2, 1, 8, 7, 5, 10, 3, 25, 20, 15, 4]


def random_ethnicity():
    k = random.choices(ETHNICITY_OPTIONS, weights=ETHNICITY_WEIGHTS, k=1)[0]
    if random.random() < 0.2:
        k2 = random.choices(ETHNICITY_OPTIONS, weights=ETHNICITY_WEIGHTS, k=1)[0]
        if k2 != k:
            return sorted([k, k2])
    return [k]


def random_civil_status():
    return random.choices(["single", "married", "widowed"], weights=[70, 20, 10], k=1)[0]


def random_shs_track():
    return random.choices(
        ["academic_track", "tvl", "art_and_design", "sport_track"],
        weights=[60, 25, 10, 5], k=1,
    )[0]


def random_shs_strand(track):
    if track == "academic_track":
        return random.choices(["STEM", "ABM", "HUMSS", "GAS"], weights=[35, 28, 22, 15], k=1)[0]
    elif track == "tvl":
        return random.choices(["ICT", "HE", "Agrifishery"], weights=[40, 35, 25], k=1)[0]
    elif track == "art_and_design":
        return "Arts and Design"
    return "Sports Track"


# ─── Status distribution per department (30 students) ────────────────────

# Groups A-E: each has (freshman_count, transferee_count)
GROUP_DEFS = [
    ("A", 4, 2),   # all verified → SUBMITTED_COMPLETE
    ("B", 4, 2),   # mix verified/pending → PENDING_DOCUMENTS
    ("C", 4, 2),   # 1 flagged, rest mix → PENDING_DOCUMENTS
    ("D", 4, 2),   # uploaded only, never submitted → null
    ("E", 4, 2),   # no docs at all → null
]

# ─── Helpers ─────────────────────────────────────────────────────────────

def make_value(value, source_key=None):
    return {
        "value": value,
        "confidence": 1.0,
        "source_key": source_key or "",
        "needs_review": False,
    }


def random_gender():
    return random.choices(["male", "female"], weights=[48, 52], k=1)[0]


def _ts(days_ago: int, hour: int = 8) -> datetime:
    """Return a timestamp offset from now."""
    return datetime.now(timezone.utc) - timedelta(days=days_ago, hours=random.randint(0, 23))


def _pick_name_pool(gender: str):
    return FIRST_NAMES_F if gender == "female" else FIRST_NAMES_M


def build_student_number(dept_code: str, counter: int) -> str:
    return f"2026-{dept_code}-{counter:04d}"


def build_file_key(student_id: uuid.UUID, doc_code: str, filename: str) -> str:
    return f"sample-data/{student_id}/{uuid.uuid4().hex[:12]}-{filename}"


def doc_types_for_classification(classification: StudentClassification) -> list[str]:
    if classification == StudentClassification.FRESHMAN:
        return FRESHMAN_DOCS
    if classification == StudentClassification.SECOND_COURSER:
        return TRANSFEREE_DOCS
    return TRANSFEREE_DOCS


def all_doc_codes_for_student(classification: StudentClassification) -> list[str]:
    docs = list(doc_types_for_classification(classification))
    docs.append(random.choice(FINANCIAL_DOCS))
    return docs


def status_after_now(base: datetime, offset_hours: int) -> datetime:
    return base + timedelta(hours=offset_hours)


def build_history(submission_id: uuid.UUID, action: str, prev_status: str | None,
                  new_status: str | None, ts: datetime, actor_id: uuid.UUID | None = None,
                  reason: str | None = None) -> DocumentSubmissionHistory:
    return DocumentSubmissionHistory(
        submission_id=submission_id,
        actor_user_id=actor_id,
        action=action,
        previous_status=prev_status,
        new_status=new_status,
        reason=reason,
        created_at=ts,
    )


# ─── Main seed logic ────────────────────────────────────────────────────

async def main():
    async with AsyncSessionLocal() as db:
        print("=== Cleaning existing seed_sample data ===")

        # Build subquery for user IDs matching seed prefix
        seed_user_ids = sa_select(User.id).where(User.clerk_user_id.like("seed_sample_%"))
        seed_student_ids = sa_select(Student.id).where(Student.user_id.in_(seed_user_ids))
        seed_sub_ids = sa_select(DocumentSubmission.id).where(DocumentSubmission.student_id.in_(seed_student_ids))
        seed_job_ids = sa_select(Job.id).where(Job.student_id.in_(seed_student_ids))

        await db.execute(sa_delete(JobSubmission).where(JobSubmission.job_id.in_(seed_job_ids)))
        await db.execute(sa_delete(DocumentSubmissionHistory).where(DocumentSubmissionHistory.submission_id.in_(seed_sub_ids)))
        await db.execute(sa_delete(DocumentSubmission).where(DocumentSubmission.student_id.in_(seed_student_ids)))
        await db.execute(sa_delete(Job).where(Job.student_id.in_(seed_student_ids)))
        await db.execute(sa_delete(Student).where(Student.user_id.in_(seed_user_ids)))
        await db.execute(sa_delete(User).where(User.clerk_user_id.like("seed_sample_%")))
        await db.commit()
        print("  Done cleaning")

        print("\n=== Generating 120 sample students ===")

        total_users = 0
        total_students = 0
        total_subs = 0
        total_history = 0
        total_jobs = 0
        total_job_subs = 0
        student_counter = 1

        dept_codes = list(DEPARTMENTS.keys())

        for dept_code in dept_codes:
            dept_id = DEPARTMENTS[dept_code]
            print(f"\n--- {dept_code} ({dept_id}) ---")

            for group_label, freshmen_n, transferee_n in GROUP_DEFS:
                for _ in range(freshmen_n):
                    await _create_student(
                        db, dept_code, dept_id, StudentClassification.FRESHMAN,
                        group_label, student_counter,
                    )
                    student_counter += 1
                    total_users += 1
                    total_students += 1
                for _ in range(transferee_n):
                    await _create_student(
                        db, dept_code, dept_id, StudentClassification.TRANSFEREE,
                        group_label, student_counter,
                    )
                    student_counter += 1
                    total_users += 1
                    total_students += 1

            await db.commit()
            print(f"  {dept_code}: 30 students created")

        # Count totals
        for tbl in ["users", "students", "document_submissions",
                     "document_submission_history", "jobs", "job_submissions"]:
            cnt = (await db.execute(sa_text(f"SELECT COUNT(*) FROM {tbl}"))).scalar()
            print(f"  {tbl}: {cnt}")

        print(f"\nNew records created: {total_users} users, {total_students} students")


async def _create_student(
    db, dept_code: str, dept_id: uuid.UUID,
    classification: StudentClassification,
    group_label: str,
    counter: int,
):
    gender = random_gender()
    first_name = random.choice(_pick_name_pool(gender))
    last_name = random.choice(LAST_NAMES)
    clerk_id = f"seed_sample_{uuid.uuid4().hex[:16]}"

    user = User(
        clerk_user_id=clerk_id,
        email=f"{first_name.lower()}.{last_name.lower()}.{dept_code.lower()}.{counter:04d}@sample.edu.ph",
        first_name=first_name,
        last_name=last_name,
        role=UserRole.STUDENT,
    )
    db.add(user)
    await db.flush()

    student_number = build_student_number(dept_code, counter)
    student = Student(
        user_id=user.id,
        school_year_id=SCHOOL_YEAR_ID,
        student_number=student_number,
        program_id=dept_id,
        classification=classification,
        classification_set_by_user=True,
    )
    db.add(student)
    await db.flush()

    student_info = {
        "first_name": first_name,
        "last_name": last_name,
        "gender": gender,
        "student_number": student_number,
        "dept_code": dept_code,
        "classification": classification.value,
    }

    doc_codes = all_doc_codes_for_student(classification)
    upload_ts = _ts(random.randint(1, 3), random.randint(6, 20))

    if group_label == "A":
        # All docs verified → SUBMITTED_COMPLETE
        for dc in doc_codes:
            await _make_verified_submission(db, student, user, dc, upload_ts, student_info)
        student.application_status = "SUBMITTED_COMPLETE"

    elif group_label == "B":
        # 4 verified + rest pending/uploaded → PENDING_DOCUMENTS
        random.shuffle(doc_codes)
        for i, dc in enumerate(doc_codes):
            if i < 4:
                await _make_verified_submission(db, student, user, dc, upload_ts, student_info)
            else:
                await _make_uploaded_submission(db, student, dc, upload_ts)
        student.application_status = "PENDING_DOCUMENTS"

    elif group_label == "C":
        # 1 flagged + 3 verified + rest pending → PENDING_DOCUMENTS
        random.shuffle(doc_codes)
        flagged = False
        for i, dc in enumerate(doc_codes):
            if not flagged:
                await _make_flagged_submission(db, student, user, dc, upload_ts)
                flagged = True
            elif i < 4:
                await _make_verified_submission(db, student, user, dc, upload_ts, student_info)
            else:
                await _make_uploaded_submission(db, student, dc, upload_ts)
        student.application_status = "PENDING_DOCUMENTS"

    elif group_label == "D":
        # 3-4 uploaded only, never submitted → null
        random.shuffle(doc_codes)
        upload_count = random.randint(3, min(4, len(doc_codes)))
        for i, dc in enumerate(doc_codes):
            if i < upload_count:
                await _make_uploaded_submission(db, student, dc, upload_ts)
        student.application_status = None

    else:
        # Group E: no docs at all → null
        student.application_status = None

    await db.flush()


async def _make_uploaded_submission(
    db, student: Student, doc_code: str, base_ts: datetime,
):
    doc_type_id = DOC_TYPE_IDS[doc_code]
    doc_name = DOC_NAMES[doc_code]
    sub_id = uuid.uuid4()
    upload_ts = status_after_now(base_ts, random.randint(0, 4))

    sub = DocumentSubmission(
        id=sub_id,
        student_id=student.id,
        file_key=build_file_key(student.id, doc_code, f"{doc_name}.pdf"),
        original_filename=f"{student.student_number}_{doc_name}.pdf",
        file_size=str(random.randint(100000, 800000)),
        mime_type="application/pdf",
        status=SubmissionStatus.UPLOADED,
        document_type_id=doc_type_id,
        created_at=upload_ts,
        updated_at=upload_ts,
    )
    db.add(sub)

    db.add(build_history(sub_id, "UPLOADED", "pending", "uploaded", upload_ts))
    return sub


async def _make_verified_submission(
    db, student: Student, user: User, doc_code: str, base_ts: datetime,
    student_info: dict | None = None,
):
    doc_type_id = DOC_TYPE_IDS[doc_code]
    doc_name = DOC_NAMES[doc_code]
    sub_id = uuid.uuid4()
    t_upload = status_after_now(base_ts, 0)
    t_classify = status_after_now(t_upload, random.randint(1, 3))
    t_extract = status_after_now(t_classify, random.randint(1, 2))
    t_submit = status_after_now(t_extract, random.randint(1, 4))
    t_review = status_after_now(t_submit, random.randint(1, 2))
    t_verify = status_after_now(t_review, random.randint(0, 1))

    sub = DocumentSubmission(
        id=sub_id,
        student_id=student.id,
        file_key=build_file_key(student.id, doc_code, f"{doc_name}.pdf"),
        original_filename=f"{student.student_number}_{doc_name}.pdf",
        file_size=str(random.randint(100000, 800000)),
        mime_type="application/pdf",
        status=SubmissionStatus.VERIFIED,
        document_type_id=doc_type_id,
        created_at=t_upload,
        updated_at=t_verify,
        verified_at=t_verify,
        verified_by=user.id,
        extracted_data=_build_extracted_data(doc_code, student_info),
    )
    db.add(sub)

    db.add(build_history(sub_id, "UPLOADED", "pending", "uploaded", t_upload))
    db.add(build_history(sub_id, "CLASSIFIED", "uploaded", "classified", t_classify))
    db.add(build_history(sub_id, "EXTRACTING", "classified", "extracting", t_extract))
    db.add(build_history(sub_id, "SUBMITTED", "extracting", "submitted", t_submit))
    db.add(build_history(sub_id, "IN_REVIEW", "submitted", "in-review", t_review))
    db.add(build_history(sub_id, "VERIFIED", "in-review", "verified", t_verify))

    # Create classify job for this submission
    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        student_id=student.id,
        operation="classify",
        status=JobStatus.FINISHED,
        result=JobResult.SUCCESS,
        progress=1,
        total=1,
        created_at=t_upload,
        started_at=t_classify,
        completed_at=t_classify,
    )
    db.add(job)
    db.add(JobSubmission(
        job_id=job_id,
        submission_id=sub_id,
        status=JobSubmissionItemStatus.COMPLETED,
    ))

    return sub


async def _make_flagged_submission(
    db, student: Student, user: User, doc_code: str, base_ts: datetime,
):
    doc_type_id = DOC_TYPE_IDS[doc_code]
    doc_name = DOC_NAMES[doc_code]
    sub_id = uuid.uuid4()
    t_upload = status_after_now(base_ts, 0)
    t_classify = status_after_now(t_upload, random.randint(1, 3))
    t_extract = status_after_now(t_classify, random.randint(1, 2))
    t_submit = status_after_now(t_extract, random.randint(1, 4))
    t_review = status_after_now(t_submit, random.randint(1, 2))
    t_flag = status_after_now(t_review, random.randint(0, 1))

    sub = DocumentSubmission(
        id=sub_id,
        student_id=student.id,
        file_key=build_file_key(student.id, doc_code, f"{doc_name}.pdf"),
        original_filename=f"{student.student_number}_{doc_name}.pdf",
        file_size=str(random.randint(100000, 800000)),
        mime_type="application/pdf",
        status=SubmissionStatus.FLAGGED,
        document_type_id=doc_type_id,
        rejection_reason=random.choice(REJECTION_REASONS),
        created_at=t_upload,
        updated_at=t_flag,
        flagged_at=t_flag,
        flagged_by=user.id,
    )
    db.add(sub)

    db.add(build_history(sub_id, "UPLOADED", "pending", "uploaded", t_upload))
    db.add(build_history(sub_id, "CLASSIFIED", "uploaded", "classified", t_classify))
    db.add(build_history(sub_id, "EXTRACTING", "classified", "extracting", t_extract))
    db.add(build_history(sub_id, "SUBMITTED", "extracting", "submitted", t_submit))
    db.add(build_history(sub_id, "IN_REVIEW", "submitted", "in-review", t_review))
    db.add(build_history(sub_id, "FLAGGED", "in-review", "flagged", t_flag,
                         reason=random.choice(REJECTION_REASONS)))

    return sub


def _build_extracted_data(doc_code: str, student_info: dict | None = None) -> dict:
    fn = (student_info or {}).get("first_name", "JUAN")
    ln = (student_info or {}).get("last_name", "DELA CRUZ")
    gender_val = (student_info or {}).get("gender", "male")
    sn = (student_info or {}).get("student_number", "2026-0000")
    dept = (student_info or {}).get("dept_code", "BSIT")
    classification = (student_info or {}).get("classification", "freshman")

    data = {"_ocr_text": "", "_raw_kie_pairs": {}}

    if doc_code == "ADMISSION_FORM":
        track = random_shs_track()
        strand = random_shs_strand(track)
        eth = random_ethnicity()
        school = random.choice(SHS_SCHOOLS)
        civil = random_civil_status()
        coastal = random.random() < 0.35
        sample_phone = f"09{random.randint(100000000, 999999999)}"

        data.update({
            "gen_0_college": make_value("COLLEGE OF COMPUTING STUDIES", "college"),
            "gen_1_school_year": make_value("2026-2027", "school_year"),
            "gen_2_type_of_admission": make_value(
                random.choice(["regular", "probational"]), "type_of_admission"),
            "gen_3_enrollment_status": make_value(classification, "enrollment_status"),
            "gen_4_scholarship": make_value(
                random.choice(["government", "private", ""]), "scholarship"),
            "gen_5_semester": make_value("1st_semester", "semester"),
            "gen_6_student_id_no": make_value(f"{sn}-{random.randint(1000,9999)}", "student_id_no"),
            "gen_7_academic_program": make_value(
                {"ACT-NT": "ACT-NT", "BSIT": "BSIT", "ACT-AD": "ACT-AD", "BSCS": "BSCS"}.get(dept, "BSIT"),
                "academic_program"),
            "gen_8_year_level": make_value("1", "year_level"),
            "gen_9_family_name": make_value(ln.upper(), "family_name"),
            "gen_10_given_name": make_value(fn.upper(), "given_name"),
            "gen_11_middle_name": make_value(
                random.choice(["", "M.", "D.", "R.", "G."]), "middle_name"),
            "gen_12_gender": make_value(gender_val, "gender"),
            "gen_13_date_of_birth": make_value(
                f"{random.randint(1998, 2005)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                "date_of_birth"),
            "gen_14_place_of_birth": make_value(
                random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY", "DIPOLOG CITY", "IPIL, ZAMBOANGA SIBUGAY"]),
                "place_of_birth"),
            "gen_15_mobile_no": make_value(sample_phone, "mobile_no"),
            "gen_16_tel_no": make_value("", "tel_no"),
            "gen_17_email_address": make_value(
                f"{fn.lower()}.{ln.lower()}.{dept.lower()}@sample.edu.ph", "email_address"),
            "gen_18_nationality": make_value("FILIPINO", "nationality"),
            "gen_19_civil_status": make_value(civil, "civil_status"),
            "gen_20_religion": make_value(
                random.choice(["ROMAN CATHOLIC", "ISLAM", "IGLESIA NI CRISTO", "BORN AGAIN"]),
                "religion"),
            "gen_21_ethnicity_tribe": make_value(eth, "ethnicity_tribe"),
            "gen_22_ethnicity_tribe_others": make_value("", "ethnicity_tribe_others"),
            "gen_23_first_family_college": make_value(
                random.choice(["yes", "no"]), "first_family_college"),
            "gen_24_disability": make_value(["none"], "disability"),
            "gen_25_disability_others": make_value("", "disability_others"),
            "gen_26_coastal_area": make_value("yes" if coastal else "no", "coastal_area"),
            "gen_27_current_house_street": make_value(
                f"LOT {random.randint(1, 999)}, BLK {random.randint(1, 50)}", "current_house_street"),
            "gen_28_current_barangay_town": make_value(
                random.choice(["AYALA, ZAMBOANGA CITY", "TETUAN, ZAMBOANGA CITY", "PASONANCA, ZAMBOANGA CITY"]),
                "current_barangay_town"),
            "gen_29_current_province": make_value("ZAMBOANGA DEL SUR", "current_province"),
            "gen_30_current_zip_code": make_value("7000", "current_zip_code"),
            "gen_31_perm_house_street": make_value(
                f"P-{random.randint(1, 10)}, {random.choice(['Upper', 'Lower', 'Poblacion'])}",
                "perm_house_street"),
            "gen_32_perm_barangay_town": make_value(
                random.choice(["TALISAYAN", "BALUNGAO", "TAMPILISAN", "LABASON"]),
                "perm_barangay_town"),
            "gen_33_perm_province": make_value(
                random.choice(["ZAMBOANGA DEL SUR", "ZAMBOANGA DEL NORTE", "ZAMBOANGA SIBUGAY"]),
                "perm_province"),
            "gen_34_father_name": make_value(
                f"{random.choice(LAST_NAMES)}, {random.choice(FIRST_NAMES_M)}", "father_name"),
            "gen_35_father_education": make_value(
                random.choice(["COLLEGE GRADUATE", "HIGH SCHOOL GRADUATE", "ELEMENTARY GRADUATE"]),
                "father_education"),
            "gen_36_father_occupation": make_value(
                random.choice(["FISHERMAN", "FARMER", "CONSTRUCTION WORKER", "DRIVER", "GOVERNMENT EMPLOYEE"]),
                "father_occupation"),
            "gen_37_mother_name": make_value(
                f"{random.choice(LAST_NAMES)}, {random.choice(FIRST_NAMES_F)}", "mother_name"),
            "gen_38_mother_education": make_value(
                random.choice(["COLLEGE GRADUATE", "HIGH SCHOOL GRADUATE", "ELEMENTARY GRADUATE"]),
                "mother_education"),
            "gen_39_mother_occupation": make_value(
                random.choice(["HOUSEWIFE", "VENDOR", "TEACHER", "GOVERNMENT EMPLOYEE"]),
                "mother_occupation"),
            "gen_40_guardian_name": make_value("", "guardian_name"),
            "gen_41_guardian_relationship": make_value("", "guardian_relationship"),
            "gen_42_guardian_address": make_value("", "guardian_address"),
            "gen_43_guardian_telephone": make_value("", "guardian_telephone"),
            "gen_44_parent_annual_income": make_value(
                random.choice(["p25k_below", "p25k_p50k", "p50k_p80k", "p80k_p135k"]),
                "parent_annual_income"),
            "gen_45_primary_school_name": make_value(
                random.choice(SHS_SCHOOLS), "primary_school_name"),
            "gen_46_primary_school_place": make_value(
                random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY", "DIPOLOG CITY"]),
                "primary_school_place"),
            "gen_47_primary_year_completed": make_value("2018", "primary_year_completed"),
            "gen_48_jhs_school_name": make_value(random.choice(SHS_SCHOOLS), "jhs_school_name"),
            "gen_49_jhs_school_place": make_value(
                random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY"]), "jhs_school_place"),
            "gen_50_jhs_year_completed": make_value("2022", "jhs_year_completed"),
            "gen_51_shs_school_name": make_value(school, "shs_school_name"),
            "gen_52_shs_school_place": make_value(
                random.choice(["ZAMBOANGA CITY"]), "shs_school_place"),
            "gen_53_shs_year_completed": make_value("2024", "shs_year_completed"),
            "gen_54_shs_track": make_value(track, "shs_track"),
            "gen_55_shs_strand": make_value(strand.lower(), "shs_strand"),
            "gen_56_college_school_name": make_value(
                random.choice(["", random.choice(SHS_SCHOOLS)]), "college_school_name"),
        })

    elif doc_code == "CET":
        data.update({
            "gen_0_application_no": make_value(f"APP-{random.randint(10000, 99999)}", "application_no"),
            "gen_1_school_year": make_value("2026-2027", "school_year"),
            "gen_2_examinee_name": make_value(f"{fn.upper()} {ln.upper()}", "examinee_name"),
            "gen_3_university_college": make_value(
                random.choice(["", "WMSU", "Ateneo de Zamboanga", "UZ"]), "university_college"),
            "gen_4_transferee_status": make_value(
                random.choice([True, False]) if classification == "transferee" else False,
                "transferee_status"),
            "gen_5_english_proficiency": make_value(
                round(random.uniform(1.0, 99.0), 2), "english_proficiency"),
            "gen_6_reading_comprehension": make_value(
                round(random.uniform(1.0, 99.0), 2), "reading_comprehension"),
            "gen_7_science_process_skills": make_value(
                round(random.uniform(1.0, 99.0), 2), "science_process_skills"),
            "gen_8_quantitative_skills": make_value(
                round(random.uniform(1.0, 99.0), 2), "quantitative_skills"),
            "gen_9_abstract_thinking_skills": make_value(
                round(random.uniform(1.0, 99.0), 2), "abstract_thinking_skills"),
            "gen_10_overall_ability_percentile_rank": make_value(
                round(random.uniform(1.0, 99.0), 2), "overall_ability_percentile_rank"),
        })

    elif doc_code == "REPORT_CARD":
        first_avg = round(random.uniform(75.0, 95.0), 2)
        second_avg = round(random.uniform(75.0, 95.0), 2)
        data.update({
            "gen_0_student_name": make_value(f"{fn.upper()} {ln.upper()}", "student_name"),
            "gen_1_school_attended": make_value(random.choice(SHS_SCHOOLS), "school_attended"),
            "gen_2_first_semester_average": make_value(first_avg, "first_semester_average"),
            "gen_3_second_semester_average": make_value(second_avg, "second_semester_average"),
            "gen_4_overall_average_gpa": make_value(
                round((first_avg + second_avg) / 2, 2), "overall_average_gpa"),
        })

    else:
        key = f"field_{doc_code.lower()}"
        data[key] = make_value(f"Sample extracted value for {doc_code}", key)

    return data


if __name__ == "__main__":
    asyncio.run(main())
