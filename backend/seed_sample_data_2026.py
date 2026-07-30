"""
Seed 90 sample students (30 per active department) for the 2026-2027 school year
with varying document submissions. Uses the new Admission Form Schema fields.
Does NOT touch 2025-2026 seed_sample_* data.

Usage:
    cd backend && python seed_sample_data_2026.py
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

random.seed(2026)

# ─── Hardcoded UUIDs ─────────────────────────────────────────────────────

SCHOOL_YEAR_ID = uuid.UUID("a99152ca-dbe3-4ff2-bbf2-db4dabc5c9d6")

DEPARTMENTS = {
    "ACT-AD": uuid.UUID("d2ac72f3-72ad-4220-8559-b699eb3e6de2"),
    "BSCS": uuid.UUID("fb1e9425-5d3c-4098-bb7b-96240c00cab5"),
    "BSIT": uuid.UUID("ba6282a3-f1ee-4b98-97cf-6f9618509b3e"),
}

DOC_TYPE_IDS = {
    "ADMISSION_FORM": uuid.UUID("6485d382-ced9-4774-b88c-720545292ce4"),
    "CET": uuid.UUID("786bbc68-2acf-4335-9c84-ecc628b37480"),
    "REPORT_CARD": uuid.UUID("a11f57da-36eb-43da-934e-57482a4b43e1"),
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
    "ADMISSION_FORM", "CET", "REPORT_CARD",
    "GOOD_MORAL_CERT", "MED_CERT",
]

TRANSFEREE_DOCS = [
    "ADMISSION_FORM", "CET", "TOR", "GOOD_MORAL_CERT", "MED_CERT",
]

DOC_NAMES = {
    "ADMISSION_FORM": "Admission_Form",
    "CET": "CET_Report_of_Rating",
    "REPORT_CARD": "Report_Card",
    "GOOD_MORAL_CERT": "Certificate_of_Good_Moral",
    "MED_CERT": "Medical_Certificate",
    "TOR": "Transcript_of_Records",
    "ITR": "Parents_Income_Tax_Return",
    "TAX_EXEMPT": "Certificate_of_Tax_Exemption",
    "AFFIDAVIT_NO_INCOME": "Affidavit_of_No_Income",
    "INDIGENCY": "Certificate_of_Indigency",
}

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
    return datetime.now(timezone.utc) - timedelta(days=days_ago, hours=random.randint(0, 23))


def _pick_name_pool(gender: str):
    return FIRST_NAMES_F if gender == "female" else FIRST_NAMES_M


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
        ["academic", "tvl", "art_and_design", "sports"],
        weights=[60, 25, 10, 5], k=1,
    )[0]


def random_shs_strand(track):
    if track == "academic":
        return random.choice(["STEM", "ABM", "HUMSS", "GAS"])
    elif track == "tvl":
        return random.choice(["ICT", "HE", "Agrifishery"])
    elif track == "art_and_design":
        return "Arts and Design"
    return "Sports Track"


def build_student_number(dept_code: str, counter: int) -> str:
    return f"2026-{dept_code}-{counter:04d}"


def build_file_key(student_id: uuid.UUID, doc_code: str, filename: str) -> str:
    return f"sample-data-2026/{student_id}/{uuid.uuid4().hex[:12]}-{filename}"


def all_doc_codes_for_student(classification: StudentClassification) -> list[str]:
    if classification == StudentClassification.FRESHMAN:
        docs = list(FRESHMAN_DOCS)
    elif classification == StudentClassification.SECOND_COURSER:
        docs = list(TRANSFEREE_DOCS)
    else:
        docs = list(TRANSFEREE_DOCS)
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


# ─── Status distribution (same as seed_sample_data.py) ───────────────────

GROUP_DEFS = [
    ("A", 4, 2),
    ("B", 4, 2),
    ("C", 4, 2),
    ("D", 4, 2),
    ("E", 4, 2),
]


# ─── Main seed logic ────────────────────────────────────────────────────

async def main():
    async with AsyncSessionLocal() as db:
        print("=== Cleaning existing seed_2026 data ===")

        seed_user_ids = sa_select(User.id).where(User.clerk_user_id.like("seed_2026_%"))
        seed_student_ids = sa_select(Student.id).where(Student.user_id.in_(seed_user_ids))
        seed_sub_ids = sa_select(DocumentSubmission.id).where(DocumentSubmission.student_id.in_(seed_student_ids))
        seed_job_ids = sa_select(Job.id).where(Job.student_id.in_(seed_student_ids))

        await db.execute(sa_delete(JobSubmission).where(JobSubmission.job_id.in_(seed_job_ids)))
        await db.execute(sa_delete(DocumentSubmissionHistory).where(DocumentSubmissionHistory.submission_id.in_(seed_sub_ids)))
        await db.execute(sa_delete(DocumentSubmission).where(DocumentSubmission.student_id.in_(seed_student_ids)))
        await db.execute(sa_delete(Job).where(Job.student_id.in_(seed_student_ids)))
        await db.execute(sa_delete(Student).where(Student.user_id.in_(seed_user_ids)))
        await db.execute(sa_delete(User).where(User.clerk_user_id.like("seed_2026_%")))
        await db.commit()
        print("  Done cleaning")

        print("\n=== Generating 90 sample students for 2026-2027 ===")

        total_users = 0
        total_students = 0
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
    clerk_id = f"seed_2026_{uuid.uuid4().hex[:16]}"

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
        for dc in doc_codes:
            await _make_verified_submission(db, student, user, dc, upload_ts, student_info)
        student.application_status = "SUBMITTED_COMPLETE"

    elif group_label == "B":
        random.shuffle(doc_codes)
        for i, dc in enumerate(doc_codes):
            if i < 4:
                await _make_verified_submission(db, student, user, dc, upload_ts, student_info)
            else:
                await _make_uploaded_submission(db, student, dc, upload_ts)
        student.application_status = "PENDING_DOCUMENTS"

    elif group_label == "C":
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
        random.shuffle(doc_codes)
        upload_count = random.randint(3, min(4, len(doc_codes)))
        for i, dc in enumerate(doc_codes):
            if i < upload_count:
                await _make_uploaded_submission(db, student, dc, upload_ts)
        student.application_status = None

    else:
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


# ─── Extracted data builders ─────────────────────────────────────────────

def _build_extracted_data(doc_code: str, student_info: dict | None = None) -> dict:
    fn = (student_info or {}).get("first_name", "JUAN")
    ln = (student_info or {}).get("last_name", "DELA CRUZ")
    gender_val = (student_info or {}).get("gender", "male")
    sn = (student_info or {}).get("student_number", "2026-0000")
    dept = (student_info or {}).get("dept_code", "BSIT")
    classification = (student_info or {}).get("classification", "freshman")

    data = {"_ocr_text": "", "_raw_kie_pairs": {}}

    if doc_code == "ADMISSION_FORM":
        data.update(_build_admission_form_data(fn, ln, gender_val, sn, dept, classification))
    elif doc_code == "CET":
        data.update(_build_cet_data(fn, ln, sn, classification))
    elif doc_code == "REPORT_CARD":
        data.update(_build_report_card_data(fn, ln))
    else:
        key = f"field_{doc_code.lower()}"
        data[key] = make_value(f"Sample extracted value for {doc_code}", key)

    return data


def _build_admission_form_data(fn, ln, gender_val, sn, dept, classification):
    track = random_shs_track()
    strand = random_shs_strand(track)
    eth = random_ethnicity()
    school = random.choice(SHS_SCHOOLS)
    civil = random_civil_status()
    coastal = random.random() < 0.35
    sample_phone = f"09{random.randint(100000000, 999999999)}"
    age = random.randint(17, 25)
    birth_month = random.randint(1, 12)
    birth_day = random.randint(1, 28)
    birth_year = 2026 - age
    has_disability = random.random() < 0.05
    gender_identity_map = {"male": "man", "female": "woman"}

    return {
        "gen_0_college_of": make_value("COLLEGE OF COMPUTING STUDIES", "college_of"),
        "gen_1_school_year": make_value("2026-2027", "school_year"),
        "gen_2_type_of_admission": make_value(
            random.choice(["regular", "probational"]), "type_of_admission"),
        "gen_3_enrollment_status": make_value(
            "first_year" if classification == "freshman" else classification,
            "enrollment_status"),
        "gen_4_scholarship": make_value(
            random.choice(["government", "private", ""]), "scholarship"),
        "gen_5_scholarship_specify": make_value(
            "", "scholarship_specify"),
        "gen_6_semester": make_value("1st_semester", "semester"),
        "gen_7_student_id_no": make_value(
            f"{sn}-{random.randint(1000, 9999)}", "student_id_no"),
        "gen_8_academic_program": make_value(dept, "academic_program"),
        "gen_9_year_level": make_value("1", "year_level"),
        "gen_10_surname": make_value(ln.upper(), "surname"),
        "gen_11_given_name": make_value(fn.upper(), "given_name"),
        "gen_12_middle_name": make_value(
            random.choice(["", "M.", "D.", "R.", "G."]), "middle_name"),
        "gen_13_ext_name": make_value(
            random.choice(["", "JR.", "SR.", "III"]), "ext_name"),
        "gen_14_age": make_value(age, "age"),
        "gen_15_date_of_birth": make_value(
            f"{birth_month:02d}/{birth_day:02d}/{birth_year}", "date_of_birth"),
        "gen_16_citizenship": make_value("FILIPINO", "citizenship"),
        "gen_17_place_of_birth_city": make_value(
            random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY", "DIPOLOG CITY", "IPIL"]),
            "place_of_birth_city"),
        "gen_18_place_of_birth_province": make_value(
            random.choice(["ZAMBOANGA DEL SUR", "ZAMBOANGA DEL NORTE", "ZAMBOANGA SIBUGAY"]),
            "place_of_birth_province"),
        "gen_19_place_of_birth_country": make_value("PHILIPPINES", "place_of_birth_country"),
        "gen_20_mobile_no": make_value(sample_phone, "mobile_no"),
        "gen_21_tel_no": make_value("", "tel_no"),
        "gen_22_email_address": make_value(
            f"{fn.lower()}.{ln.lower()}.{dept.lower()}@sample.edu.ph", "email_address"),
        "gen_23_nationality": make_value("FILIPINO", "nationality"),
        "gen_24_civil_status": make_value(civil, "civil_status"),
        "gen_25_religion": make_value(
            random.choice(["ROMAN CATHOLIC", "ISLAM", "IGLESIA NI CRISTO", "BORN AGAIN"]),
            "religion"),
        "gen_26_ethnicity_tribe": make_value(eth, "ethnicity_tribe"),
        "gen_27_ethnicity_tribe_others": make_value("", "ethnicity_tribe_others"),
        "gen_28_sex": make_value(gender_val, "sex"),
        "gen_29_gender_identity": make_value(
            gender_identity_map.get(gender_val, "man"), "gender_identity"),
        "gen_30_gender_identity_others": make_value("", "gender_identity_others"),
        "gen_31_current_address_house_street": make_value(
            f"LOT {random.randint(1, 999)}, BLK {random.randint(1, 50)}",
            "current_address_house_street"),
        "gen_32_current_address_barangay_town_city": make_value(
            random.choice(["AYALA, ZAMBOANGA CITY", "TETUAN, ZAMBOANGA CITY",
                           "PASONANCA, ZAMBOANGA CITY"]),
            "current_address_barangay_town_city"),
        "gen_33_current_address_province": make_value(
            "ZAMBOANGA DEL SUR", "current_address_province"),
        "gen_34_current_address_zip_code": make_value("7000", "current_address_zip_code"),
        "gen_35_permanent_address_same_as_current": make_value(
            random.choice([True, False]), "permanent_address_same_as_current"),
        "gen_36_permanent_address_zip_code": make_value(
            random.choice(["7000", "7016", "7001"]), "permanent_address_zip_code"),
        "gen_37_permanent_address_contact_no": make_value(
            f"09{random.randint(100000000, 999999999)}", "permanent_address_contact_no"),
        "gen_38_rented_accommodation": make_value(
            random.choice(["yes", "no"]), "rented_accommodation"),
        "gen_39_rented_accommodation_type": make_value(
            random.choice(["", "boarding_house", "dormitory", "apartment"]),
            "rented_accommodation_type"),
        "gen_40_rented_accommodation_type_other": make_value(
            "", "rented_accommodation_type_other"),
        "gen_41_primary_school_name": make_value(
            random.choice(SHS_SCHOOLS), "primary_school_name"),
        "gen_42_primary_school_address": make_value(
            random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY"]),
            "primary_school_address"),
        "gen_43_primary_year_completed": make_value("2018", "primary_year_completed"),
        "gen_44_junior_high_school_name": make_value(
            random.choice(SHS_SCHOOLS), "junior_high_school_name"),
        "gen_45_junior_high_school_address": make_value(
            random.choice(["ZAMBOANGA CITY", "PAGADIAN CITY"]),
            "junior_high_school_address"),
        "gen_46_junior_high_year_completed": make_value("2022", "junior_high_year_completed"),
        "gen_47_senior_high_school_name": make_value(school, "senior_high_school_name"),
        "gen_48_senior_high_school_address": make_value(
            "ZAMBOANGA CITY", "senior_high_school_address"),
        "gen_49_senior_high_year_completed": make_value("2024", "senior_high_year_completed"),
        "gen_50_senior_high_track": make_value(track, "shs_track"),
        "gen_51_senior_high_strand": make_value(strand.lower(), "shs_strand"),
        "gen_52_college_school_name": make_value("", "college_school_name"),
        "gen_53_college_school_address": make_value("", "college_school_address"),
        "gen_54_college_year_completed": make_value("", "college_year_completed"),
        "gen_55_first_person_to_attend_college": make_value(
            random.choice(["yes", "no"]), "first_person_to_attend_college"),
        "gen_56_first_person_siblings_to_attend_college": make_value(
            random.choice(["yes", "no"]), "first_person_siblings_to_attend_college"),
        "gen_57_birth_order_siblings": make_value(
            f"{random.choice(['1st', '2nd', '3rd', '4th', '5th'])}", "birth_order_siblings"),
        "gen_58_person_with_disability": make_value(
            "yes" if has_disability else "no", "person_with_disability"),
        "gen_59_type_of_disability": make_value(
            ["none"] if not has_disability
            else [random.choice(["hearing_impaired", "visually_impaired",
                                 "cleft_palate", "orthopedic_disability"])],
            "type_of_disability"),
        "gen_60_type_of_disability_others": make_value("", "type_of_disability_others"),
        "gen_61_father_name": make_value(
            f"{random.choice(LAST_NAMES)}, {random.choice(FIRST_NAMES_M)}", "father_name"),
        "gen_62_father_educational_attainment": make_value(
            random.choice(["COLLEGE GRADUATE", "HIGH SCHOOL GRADUATE",
                           "ELEMENTARY GRADUATE", "POST GRADUATE"]),
            "father_educational_attainment"),
        "gen_63_father_occupation": make_value(
            random.choice(["FISHERMAN", "FARMER", "CONSTRUCTION WORKER",
                           "DRIVER", "GOVERNMENT EMPLOYEE", "OVERSEAS WORKER"]),
            "father_occupation"),
        "gen_64_mother_name": make_value(
            f"{random.choice(LAST_NAMES)}, {random.choice(FIRST_NAMES_F)}", "mother_name"),
        "gen_65_mother_educational_attainment": make_value(
            random.choice(["COLLEGE GRADUATE", "HIGH SCHOOL GRADUATE",
                           "ELEMENTARY GRADUATE", "POST GRADUATE"]),
            "mother_educational_attainment"),
        "gen_66_mother_occupation": make_value(
            random.choice(["HOUSEWIFE", "VENDOR", "TEACHER",
                           "GOVERNMENT EMPLOYEE", "OVERSEAS WORKER"]),
            "mother_occupation"),
        "gen_67_guardian_name": make_value("", "guardian_name"),
        "gen_68_guardian_address": make_value("", "guardian_address"),
        "gen_69_guardian_relationship": make_value("", "guardian_relationship"),
        "gen_70_guardian_contact_no": make_value("", "guardian_contact_no"),
        "gen_71_parents_monthly_gross_income": make_value(
            random.choice(["25000_and_below", "25001_50000", "50001_80000",
                           "80001_135000", "135001_250000", "4ps"]),
            "parents_monthly_gross_income"),
        "gen_72_working_student": make_value(
            random.choice(["yes", "no"]), "working_student"),
        "gen_73_nature_of_employment": make_value(
            random.choice(["", "part_time", "self_employed"]), "nature_of_employment"),
        "gen_74_nature_of_employment_others": make_value(
            "", "nature_of_employment_others"),
        "gen_75_dependent_of_solo_parent": make_value(
            random.choice(["yes", "no"]), "dependent_of_solo_parent"),
        "gen_76_son_daughter_of_ofw": make_value(
            random.choice(["yes", "no"]), "son_daughter_of_ofw"),
        "gen_77_ofw_country": make_value(
            random.choice(["", "SAUDI ARABIA", "UAE", "HONG KONG", "JAPAN", "QATAR"]),
            "ofw_country"),
    }


def _build_cet_data(fn, ln, sn, classification):
    return {
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
    }


def _build_report_card_data(fn, ln):
    first_avg = round(random.uniform(75.0, 95.0), 2)
    second_avg = round(random.uniform(75.0, 95.0), 2)
    return {
        "gen_0_student_name": make_value(f"{fn.upper()} {ln.upper()}", "student_name"),
        "gen_1_school_attended": make_value(random.choice(SHS_SCHOOLS), "school_attended"),
        "gen_2_first_semester_average": make_value(first_avg, "first_semester_average"),
        "gen_3_second_semester_average": make_value(second_avg, "second_semester_average"),
        "gen_4_overall_average_gpa": make_value(
            round((first_avg + second_avg) / 2, 2), "overall_average_gpa"),
    }


if __name__ == "__main__":
    asyncio.run(main())
