"""
Seed synthetic analytics test data across 3 school years.
- Creates school year 2023-2024 if missing
- Tags is_analytics on fields in Admission Form Schema, CET Schema, and Report Card Schema
- Links all 3 schemas to all 3 school years
- Generates 90 students (30 per year) with varied demographics
- Creates verified submissions for Admission Form, CET, and Report Card
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select, delete, func, text
from sqlalchemy.orm import attributes

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
    UserRole,
    Department,
    ExtractionSchemaStatus,
    SchoolYearStatus,
    StudentClassification,
)


random.seed(42)

# ─── Analytics field definitions per schema ───────────────────────────────

ADMISSION_ANALYTICS = [
    {"key": "type_of_admission", "type": "select",
     "canonical_key": "type_of_admission", "analytics_group": "Enrollment Statistics"},
    {"key": "enrollment_status", "type": "select",
     "canonical_key": "enrollment_status", "analytics_group": "Enrollment Statistics"},
    {"key": "gender", "type": "select",
     "canonical_key": "gender", "analytics_group": "Demographic"},
    {"key": "civil_status", "type": "string",
     "canonical_key": "civil_status", "analytics_group": "Demographic"},
    {"key": "ethnicity_tribe", "type": "multi-select",
     "canonical_key": "ethnicity_tribe", "analytics_group": "Demographic"},
    {"key": "disability", "type": "multi-select",
     "canonical_key": "disability", "analytics_group": "Demographic"},
    {"key": "coastal_area", "type": "boolean",
     "canonical_key": "coastal_area", "analytics_group": "Demographic"},
    {"key": "senior_high_track", "type": "select",
     "canonical_key": "senior_high_track", "analytics_group": "High School Performance"},
    {"key": "senior_high_strand", "type": "select",
     "canonical_key": "senior_high_strand", "analytics_group": "High School Performance"},
    {"key": "senior_high_school_name", "type": "string",
     "canonical_key": "senior_high_school_name", "analytics_group": "High School Performance"},
]

CET_ANALYTICS = [
    {"key": "english_proficiency", "type": "number",
     "canonical_key": "english_proficiency", "analytics_group": "CET Performance"},
    {"key": "reading_comprehension", "type": "number",
     "canonical_key": "reading_comprehension", "analytics_group": "CET Performance"},
    {"key": "science_process_skills", "type": "number",
     "canonical_key": "science_process_skills", "analytics_group": "CET Performance"},
    {"key": "quantitative_skills", "type": "number",
     "canonical_key": "quantitative_skills", "analytics_group": "CET Performance"},
    {"key": "abstract_thinking_skills", "type": "number",
     "canonical_key": "abstract_thinking_skills", "analytics_group": "CET Performance"},
    {"key": "overall_ability_percentile_rank", "type": "number",
     "canonical_key": "overall_ability_percentile_rank", "analytics_group": "CET Performance"},
]

REPORT_CARD_ANALYTICS = [
    {"key": "school_attended", "type": "string",
     "canonical_key": "school_attended", "analytics_group": "High School Performance"},
    {"key": "first_semester_average", "type": "number",
     "canonical_key": "first_semester_average", "analytics_group": "High School Performance"},
    {"key": "second_semester_average", "type": "number",
     "canonical_key": "second_semester_average", "analytics_group": "High School Performance"},
    {"key": "general_average", "type": "number",
     "canonical_key": "general_average", "analytics_group": "High School Performance"},
]

ALL_ANALYTICS = ADMISSION_ANALYTICS + CET_ANALYTICS + REPORT_CARD_ANALYTICS

def _kid(kmap: dict[str, str], key: str) -> str:
    """Look up field ID in schema-specific key map, falling back to key."""
    return kmap.get(key) or key


# ─── Random value pools ─────────────────────────────────────────────────

FIRST_NAMES_F = [
    "Maria", "Ana", "Rosa", "Teresita", "Luzviminda", "Carmen", "Elena", "Gloria",
    "Imelda", "Josefina", "Lourdes", "Marlene", "Nenita", "Perlita", "Remedios",
    "Fe", "Corazon", "Leticia", "Milagros", "Norma", "Ofelia", "Pilar", "Rosario",
    "Salvacion", "Thelma", "Virginia", "Zenaida", "Cristina", "Diana", "Evelyn",
]

FIRST_NAMES_M = [
    "Jose", "Juan", "Pedro", "Carlos", "Eduardo", "Antonio", "Manuel", "Francisco",
    "Ramon", "Ricardo", "Fernando", "Gregorio", "Hilario", "Isidro", "Leonardo",
    "Mario", "Nicolas", "Orlando", "Pablo", "Quirino", "Rodrigo", "Santiago",
    "Teodoro", "Urbano", "Vicente", "Wilfredo", "Xavier", "Alberto", "Benjamin", "Cesar",
]

LAST_NAMES = [
    "Santos", "Reyes", "Cruz", "Bautista", "Gonzales", "Mendoza", "Aquino",
    "Dela Cruz", "Garcia", "Rodriguez", "Martinez", "Fernandez", "Lopez",
    "Villanueva", "Torres", "Rivera", "Castillo", "Ramos", "Domingo", "Miranda",
    "Gutierrez", "Navarro", "Alcantara", "Velasco", "Serrano", "Lazaro", "Cortez",
    "Mercado", "Valdez", "Roldan",
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
    "STI College – Zamboanga",
    "Caldwell Adventist Academy",
    "Montessori de Zamboanga",
    "MEIN College, Inc.",
    "Brent Hospital and Colleges Incorporated",
    "Universidad de Zamboanga Technical High School",
    "Filipino-Turkish Tolerance School",
    "HMIJ Foundation – Philippine Islamic College, Inc.",
    "J-Jireh School",
    "Good Shepherd Mission School",
]

ETHNICITY_OPTIONS = [
    "badjao", "manobo", "subanen", "sama", "yakan", "tausug",
    "maranao", "visayan", "zamboangueno", "tagalog", "maguindanaoan",
]

ETHNICITY_WEIGHTS = [2, 1, 8, 7, 5, 10, 3, 25, 20, 15, 4]

DEPARTMENT_IDS: list[str] = []


def make_value(value, source_key=None):
    return {
        "value": value,
        "confidence": 1.0,
        "source_key": source_key or "",
        "needs_review": False,
    }


def make_admission_template(km):
    """Build a base extracted_data dict for Admission Form using schema-specific field key→id map."""
    t = {}
    t["_ocr_text"] = ""
    t["_raw_kie_pairs"] = {}
    for field_key in [
        "college", "school_year", "type_of_admission",
        "enrollment_status", "scholarship", "semester",
        "student_id_no", "academic_program", "year_level",
        "family_name", "given_name", "middle_name",
        "nationality", "civil_status", "religion", "gender",
        "date_of_birth", "place_of_birth", "mobile_no",
        "tel_no", "email_address",
        "ethnicity_tribe", "ethnicity_tribe_others_specify",
        "first_family_enroll_college", "disability", "disability_others_specify", "coastal_area",
        "current_house_street", "current_barangay_town_city",
        "current_provincial_address", "current_zip_code",
        "permanent_house_street", "permanent_barangay_town_city",
        "permanent_provincial_address",
        "father_name", "father_educational_attainment", "father_occupation",
        "mother_name", "mother_educational_attainment", "mother_occupation",
        "guardian_name", "guardian_relationship",
        "guardian_address", "guardian_telephone_no",
        "parents_annual_gross_income",
        "primary_school_name", "primary_school_place", "primary_year_completed",
        "junior_high_school_name", "junior_high_school_place", "junior_high_year_completed",
        "senior_high_school_name", "senior_high_school_place", "senior_high_year_completed",
        "senior_high_track", "senior_high_strand",
        "college_school_name",
    ]:
        f_id = km.get(field_key) or field_key
        t[f_id] = make_value("", field_key)
    t[km.get("college") or "college"] = make_value("COLLEGE OF COMPUTING STUDIES", "college")
    t[km.get("type_of_admission") or "type_of_admission"] = make_value("regular", "type_of_admission")
    t[km.get("enrollment_status") or "enrollment_status"] = make_value("freshman", "enrollment_status")
    t[km.get("semester") or "semester"] = make_value("1st_semester", "semester")
    t[km.get("academic_program") or "academic_program"] = make_value("BSIT", "academic_program")
    t[km.get("year_level") or "year_level"] = make_value("1", "year_level")
    t[km.get("nationality") or "nationality"] = make_value("FILIPINO", "nationality")
    t[km.get("religion") or "religion"] = make_value("ROMAN CATHOLIC", "religion")
    t[km.get("first_family_enroll_college") or "first_family_enroll_college"] = make_value("no", "first_family_enroll_college")
    t[km.get("disability") or "disability"] = make_value(["none"], "disability")
    t[km.get("current_barangay_town_city") or "current_barangay_town_city"] = make_value("AYALA, TOWNSHIP, Z.C.", "current_barangay_town_city")
    t[km.get("current_provincial_address") or "current_provincial_address"] = make_value("ZAMBOANGA DEL SUR", "current_provincial_address")
    t[km.get("current_zip_code") or "current_zip_code"] = make_value("7000", "current_zip_code")
    t[km.get("current_house_street") or "current_house_street"] = make_value("LOT NO. 7, CALLE", "current_house_street")
    t[km.get("permanent_barangay_town_city") or "permanent_barangay_town_city"] = make_value("AYALA, TOWNSHIP, Z.C.", "permanent_barangay_town_city")
    t[km.get("permanent_provincial_address") or "permanent_provincial_address"] = make_value("ZAMBOANGA DEL SUR", "permanent_provincial_address")
    t[km.get("permanent_house_street") or "permanent_house_street"] = make_value("LOT NO. 7, CALLE", "permanent_house_street")
    return t


def random_ethnicity():
    """Return list of 1-2 ethnicity values weighted by regional distribution."""
    k = random.choices(ETHNICITY_OPTIONS, weights=ETHNICITY_WEIGHTS, k=1)[0]
    # ~20% get a second ethnicity
    if random.random() < 0.2:
        k2 = random.choices(ETHNICITY_OPTIONS, weights=ETHNICITY_WEIGHTS, k=1)[0]
        if k2 != k:
            return sorted([k, k2])
    return [k]


def random_gender():
    return random.choices(["male", "female"], weights=[48, 52], k=1)[0]


def random_civil_status():
    return random.choices(["single", "married", "widowed"], weights=[70, 20, 10], k=1)[0]


def random_shs_track():
    return random.choices(
        ["Academic Track", "TVL", "Arts and Design", "Sports Track"],
        weights=[60, 25, 10, 5], k=1,
    )[0]


def random_shs_strand(track):
    if track == "Academic Track":
        return random.choices(["STEM", "ABM", "HUMSS", "GAS"], weights=[35, 28, 22, 15], k=1)[0]
    elif track == "TVL":
        return random.choices(["ICT", "HE", "Agri-Fishery"], weights=[40, 35, 25], k=1)[0]
    elif track == "Arts and Design":
        return random.choices(["Arts and Design"], weights=[1], k=1)[0]
    else:
        return random.choices(["Sports Track"], weights=[1], k=1)[0]


def random_cet_score():
    return random.randint(1, 99)


def random_gpa():
    return round(random.uniform(75.0, 98.0), 2)


async def main():
    async with AsyncSessionLocal() as db:
        print("=== Loading existing data ===")

        # Departments
        depts = (await db.execute(select(Department).where(Department.is_active == True))).scalars().all()
        dept_ids = [str(d.id) for d in depts]
        print(f"Found {len(dept_ids)} departments")

        # Document types
        adm_doc_type = (await db.execute(
            select(DocumentType).where(DocumentType.code == "ADMISSION_FORM")
        )).scalar_one_or_none()
        cet_doc_type = (await db.execute(
            select(DocumentType).where(DocumentType.code == "CET")
        )).scalar_one_or_none()
        rc_doc_type = (await db.execute(
            select(DocumentType).where(DocumentType.code == "REPORT_CARD")
        )).scalar_one_or_none()

        if not all([adm_doc_type, cet_doc_type, rc_doc_type]):
            print("ERROR: Missing required document types (ADMISSION_FORM, CET, REPORT_CARD)")
            return

        print(f"Doc Types: Admission={str(adm_doc_type.id)[:8]} CET={str(cet_doc_type.id)[:8]} ReportCard={str(rc_doc_type.id)[:8]}")

        # School years
        years_data = {
            "2023-2024": {"start": date(2023, 8, 25), "end": date(2024, 5, 4), "status": SchoolYearStatus.CLOSED},
            "2025-2026": {"start": date(2025, 8, 4), "end": date(2026, 5, 18), "status": SchoolYearStatus.CLOSED},
            "2026-2027": {"start": date(2026, 8, 3), "end": date(2027, 5, 17), "status": SchoolYearStatus.ACTIVE},
        }

        school_years = {}
        for name, yd in years_data.items():
            sy = (await db.execute(select(SchoolYear).where(SchoolYear.name == name))).scalar_one_or_none()
            if not sy:
                sy = SchoolYear(
                    name=name, start_date=yd["start"], end_date=yd["end"],
                    status=yd["status"], is_active=(yd["status"] == SchoolYearStatus.ACTIVE),
                )
                db.add(sy)
                await db.flush()
                print(f"Created SchoolYear: {name}")
            school_years[name] = sy
            print(f"SY: {name} id={str(sy.id)[:8]} status={sy.status.value}")

        # ─── Tag schemas with is_analytics ──────────────────────────────────
        print("=== Tagging schemas with is_analytics ===")

        schemas_to_tag = {
            "Admission Form Schema": ADMISSION_ANALYTICS,
            "CET Schema": CET_ANALYTICS,
            "Report Card Schema": REPORT_CARD_ANALYTICS,
        }

        schema_ids: dict[str, str] = {}
        schema_field_maps: dict[str, dict[str, str]] = {}
        for schema_name, analytics_fields in schemas_to_tag.items():
            schema = (await db.execute(
                select(ExtractionSchema).where(ExtractionSchema.name == schema_name)
            )).scalar_one_or_none()
            if not schema:
                print(f"ERROR: Schema '{schema_name}' not found!")
                continue

            fields = list(schema.fields_json or [])
            key_to_id: dict[str, str] = {}
            for f in fields:
                if isinstance(f, dict) and f.get("key") and f.get("id"):
                    key_to_id[f["key"]] = f["id"]

            updated_count = 0
            for ana in analytics_fields:
                ana_key = ana["key"]
                ana_id = key_to_id.get(ana_key)
                if not ana_id:
                    print(f"  WARNING: Field key '{ana_key}' not found in schema '{schema_name}'")
                    continue
                for i, f in enumerate(fields):
                    if isinstance(f, dict) and f.get("id") == ana_id:
                        fields[i] = {**f,
                            "is_analytics": True,
                            "canonical_key": ana["canonical_key"],
                            "analytics_group": ana["analytics_group"],
                        }
                        updated_count += 1
                        break

            schema.fields_json = fields
            if schema.status != ExtractionSchemaStatus.ACTIVE:
                schema.status = ExtractionSchemaStatus.ACTIVE
            schema_ids[schema_name] = str(schema.id)
            schema_field_maps[schema_name] = key_to_id
            await db.flush()
            print(f"Schema '{schema_name}': tagged {updated_count}/{len(analytics_fields)} analytics fields")

        await db.commit()
        print()

        # ─── Build master field mapping for data generation ──────────────────
        all_schemas_list = (
            await db.execute(select(ExtractionSchema))
        ).scalars().all()

        field_id_by_key: dict[str, str] = {}
        schema_key_maps: dict[str, dict[str, str]] = {}
        for schema in all_schemas_list:
            kmap: dict[str, str] = {}
            for f in (schema.fields_json or []):
                if isinstance(f, dict) and f.get("key") and f.get("id"):
                    kmap[f["key"]] = f["id"]
                    field_id_by_key[f["key"]] = f["id"]
            schema_key_maps[schema.name] = kmap

        def fid(key: str) -> str:
            return field_id_by_key.get(key) or key

        admission_kmap = schema_key_maps.get("Admission Form Schema", field_id_by_key)
        cet_kmap = schema_key_maps.get("CET Schema", field_id_by_key)
        rc_kmap = schema_key_maps.get("Report Card Schema", field_id_by_key)

        # ─── Migrate existing seed submissions: key → id ──────────────────────
        print("=== Migrating existing seed submissions (key → id alignment) ===")

        analytics_key_to_id: dict[str, str] = {}
        for schema in all_schemas_list:
            for f in (schema.fields_json or []):
                if not isinstance(f, dict):
                    continue
                if not f.get("is_analytics"):
                    continue
                fid_val = f.get("id") or ""
                fk = f.get("key") or ""
                if fid_val and fk:
                    analytics_key_to_id[fk] = fid_val

        if analytics_key_to_id:
            seed_subs = (
                await db.execute(
                    select(DocumentSubmission).where(
                        DocumentSubmission.file_key.like("seed/%"),
                        DocumentSubmission.extracted_data.isnot(None),
                    )
                )
            ).scalars().all()

            migrated_count = 0
            for sub in seed_subs:
                data = sub.extracted_data
                if not isinstance(data, dict):
                    continue
                changed = False
                for old_key, new_id_val in analytics_key_to_id.items():
                    if old_key in data and old_key != new_id_val:
                        data[new_id_val] = data.pop(old_key)
                        changed = True
                if changed:
                    attributes.flag_modified(sub, "extracted_data")
                    migrated_count += 1

            if migrated_count:
                await db.commit()
                print(f"  Migrated {migrated_count} seed submissions")
            else:
                print("  No seed submissions needed migration")
        else:
            print("  No analytics field mappings found; skipping migration")

        print()

        # ─── Link schemas to all school years via SYR ─────────────────────────
        print("=== Linking schemas to school years ===")

        doc_schema_map = {
            "ADMISSION_FORM": "Admission Form Schema",
            "CET": "CET Schema",
            "REPORT_CARD": "Report Card Schema",
        }

        for sy_name, sy in school_years.items():
            for doc_code, schema_name in doc_schema_map.items():
                schema_id_str = schema_ids.get(schema_name)
                if not schema_id_str:
                    continue
                doc_type_id_map = {
                    "ADMISSION_FORM": adm_doc_type.id,
                    "CET": cet_doc_type.id,
                    "REPORT_CARD": rc_doc_type.id,
                }
                dt_id = doc_type_id_map[doc_code]

                syr = (await db.execute(
                    select(SchoolYearRequirement).where(
                        SchoolYearRequirement.school_year_id == sy.id,
                        SchoolYearRequirement.document_type_id == dt_id,
                    )
                )).scalar_one_or_none()

                if syr:
                    syr.extraction_schema_id = uuid.UUID(schema_id_str)
                    print(f"SYR updated: {sy_name} + {doc_code} -> schema={schema_name}")
                else:
                    # Create SYR if missing
                    syr = SchoolYearRequirement(
                        school_year_id=sy.id,
                        document_type_id=dt_id,
                        extraction_schema_id=uuid.UUID(schema_id_str),
                    )
                    db.add(syr)
                    print(f"SYR created: {sy_name} + {doc_code} -> schema={schema_name}")

        await db.commit()
        print()

        # ─── Clean up existing seed data ──────────────────────────────────────
        print("=== Cleaning up existing seed data ===")

        existing_seed_subs = await db.execute(
            select(DocumentSubmission).where(DocumentSubmission.file_key.like("seed/%"))
        )
        seed_sub_ids = [s.id for s in existing_seed_subs.scalars().all()]
        if seed_sub_ids:
            await db.execute(
                delete(DocumentSubmission).where(DocumentSubmission.id.in_(seed_sub_ids))
            )
            print(f"  Deleted {len(seed_sub_ids)} existing seed submissions")

        existing_seed_students = await db.execute(
            select(Student).where(
                Student.user_id.in_(
                    select(User.id).where(User.clerk_user_id.like("seed_analytics_%"))
                )
            )
        )
        seed_student_ids = [s.id for s in existing_seed_students.scalars().all()]
        if seed_student_ids:
            await db.execute(
                delete(Student).where(Student.id.in_(seed_student_ids))
            )
            print(f"  Deleted {len(seed_student_ids)} existing seed students")

        existing_seed_users = await db.execute(
            select(User).where(User.clerk_user_id.like("seed_analytics_%"))
        )
        seed_user_ids = [u.id for u in existing_seed_users.scalars().all()]
        if seed_user_ids:
            await db.execute(
                delete(User).where(User.id.in_(seed_user_ids))
            )
            print(f"  Deleted {len(seed_user_ids)} existing seed users")

        await db.commit()
        print()

        # ─── Build user name pool ────────────────────────────────────────────
        print("=== Generating student data ===")
        pairs = []
        for fn in FIRST_NAMES_F:
            for ln in LAST_NAMES:
                pairs.append(("female", fn, ln))
        for fn in FIRST_NAMES_M:
            for ln in LAST_NAMES:
                pairs.append(("male", fn, ln))
        random.shuffle(pairs)

        student_number_counters = {name: 1 for name in school_years}

        total_users = 0
        total_students = 0
        total_subs = 0

        year_list = ["2023-2024", "2025-2026", "2026-2027"]
        students_per_year = 30

        for sy_name in year_list:
            sy = school_years[sy_name]
            print(f"\n--- {sy_name} ---")

            for i in range(students_per_year):
                gender_val, first, last = pairs[(year_list.index(sy_name) * students_per_year + i) % len(pairs)]

                # User
                clerk_id = f"seed_analytics_{uuid.uuid4().hex[:16]}"
                user = User(
                    clerk_user_id=clerk_id,
                    email=f"{first.lower()}.{last.lower()}.{sy_name[:4]}@seed.edu.ph",
                    first_name=first,
                    last_name=last,
                    role=UserRole.STUDENT,
                )
                db.add(user)
                await db.flush()

                # Student
                sn = f"{sy_name[:4]}-{student_number_counters[sy_name]:05d}"
                student_number_counters[sy_name] += 1
                dept_id = uuid.UUID(random.choice(dept_ids))
                classification = random.choices(
                    [StudentClassification.FRESHMAN, StudentClassification.TRANSFEREE,
                     StudentClassification.SHIFTER, StudentClassification.RETURNING,
                     StudentClassification.CROSS_ENROLLEE, StudentClassification.SECOND_COURSER],
                    weights=[55, 15, 10, 15, 5, 3], k=1,
                )[0]

                student = Student(
                    user_id=user.id,
                    school_year_id=sy.id,
                    student_number=sn,
                    program_id=dept_id,
                    classification=classification,
                )
                db.add(student)
                await db.flush()
                total_users += 1
                total_students += 1

                # ─── Admission Form submission ───────────────────────────
                track = random_shs_track()
                strand = random_shs_strand(track)
                eth_list = random_ethnicity()
                school = random.choice(SHS_SCHOOLS)
                coastal = random.random() < 0.35
                civil = random_civil_status()

                adm_data = make_admission_template(admission_kmap)
                adm_data[_kid(admission_kmap, "given_name")] = make_value(first.upper(), "given_name")
                adm_data[_kid(admission_kmap, "family_name")] = make_value(last.upper(), "family_name")
                adm_data[_kid(admission_kmap, "gender")] = make_value(gender_val, "gender")
                adm_data[_kid(admission_kmap, "civil_status")] = make_value(civil, "civil_status")
                adm_data[_kid(admission_kmap, "ethnicity_tribe")] = make_value(eth_list, "ethnicity_tribe")
                adm_data[_kid(admission_kmap, "senior_high_track")] = make_value(track.lower().replace(" ", "_"), "senior_high_track")
                adm_data[_kid(admission_kmap, "senior_high_strand")] = make_value(strand.lower(), "senior_high_strand")
                adm_data[_kid(admission_kmap, "senior_high_school_name")] = make_value(school, "senior_high_school_name")
                adm_data[_kid(admission_kmap, "coastal_area")] = make_value("yes" if coastal else "no", "coastal_area")
                adm_data[_kid(admission_kmap, "academic_program")] = make_value(
                    random.choice(["BSIT", "BSCS", "ACT-AD", "ACT-NT"]), "academic_program"
                )

                # Random optional fields
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "scholarship")] = make_value(
                        random.choice(["government", "private"]), "scholarship"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "student_id_no")] = make_value(
                        f"{sn}-{random.randint(1000,9999)}", "student_id_no"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "tel_no")] = make_value(
                        f"0{random.randint(620000000, 629999999)}", "tel_no"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "ethnicity_tribe_others_specify")] = make_value(
                        random.choice(["lumad", "chavacano"]), "ethnicity_tribe_others_specify"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "disability_others_specify")] = make_value(
                        "speech impairment", "disability_others_specify"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "guardian_name")] = make_value(
                        f"{random.choice(LAST_NAMES)}, {random.choice(FIRST_NAMES_F)}", "guardian_name"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "guardian_relationship")] = make_value(
                        random.choice(["aunt", "uncle", "grandparent", "sibling"]), "guardian_relationship"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "guardian_address")] = make_value(
                        "ZAMBOANGA CITY", "guardian_address"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "guardian_telephone_no")] = make_value(
                        f"0{random.randint(620000000, 629999999)}", "guardian_telephone_no"
                    )
                if random.random() < 0.5:
                    adm_data[_kid(admission_kmap, "college_school_name")] = make_value(
                        random.choice(SHS_SCHOOLS), "college_school_name"
                    )

                adm_sub = DocumentSubmission(
                    student_id=student.id,
                    file_key=f"seed/admission/{sn}.pdf",
                    original_filename=f"admission_form_{sn}.pdf",
                    file_size=str(random.randint(50000, 500000)),
                    mime_type="application/pdf",
                    status=SubmissionStatus.VERIFIED,
                    extracted_data=adm_data,
                    document_type_id=adm_doc_type.id,
                    verified_at=datetime.now(timezone.utc),
                )
                db.add(adm_sub)
                total_subs += 1

                # ─── CET submission ──────────────────────────────────────
                cet_data = {}
                for ana in CET_ANALYTICS:
                    score = random_cet_score()
                    cet_data[_kid(cet_kmap, ana["key"])] = make_value(score, ana["key"])
                cet_data[_kid(cet_kmap, "school_year")] = make_value(sy_name, "school_year")
                cet_data[_kid(cet_kmap, "student_name")] = make_value(f"{first} {last}", "student_name")
                if random.random() < 0.5:
                    cet_data[_kid(cet_kmap, "university_college")] = make_value(
                        random.choice(["WMSU", "Ateneo de Zamboanga", "UZ"]), "university_college"
                    )
                if random.random() < 0.5:
                    cet_data[_kid(cet_kmap, "transferee_status")] = make_value(
                        True, "transferee_status"
                    )

                cet_sub = DocumentSubmission(
                    student_id=student.id,
                    file_key=f"seed/cet/{sn}.pdf",
                    original_filename=f"cet_{sn}.pdf",
                    file_size=str(random.randint(30000, 200000)),
                    mime_type="application/pdf",
                    status=SubmissionStatus.VERIFIED,
                    extracted_data=cet_data,
                    document_type_id=cet_doc_type.id,
                    verified_at=datetime.now(timezone.utc),
                )
                db.add(cet_sub)
                total_subs += 1

                # ─── Report Card submission ──────────────────────────────
                rc_data = {}
                for ana in REPORT_CARD_ANALYTICS:
                    rc_data[_kid(rc_kmap, ana["key"])] = make_value(
                        round(random.uniform(75.0, 98.0), 2) if ana["type"] == "number" else school,
                        ana["key"],
                    )
                rc_data[_kid(rc_kmap, "student_name")] = make_value(f"{first} {last}", "student_name")

                rc_sub = DocumentSubmission(
                    student_id=student.id,
                    file_key=f"seed/report_card/{sn}.pdf",
                    original_filename=f"report_card_{sn}.pdf",
                    file_size=str(random.randint(40000, 300000)),
                    mime_type="application/pdf",
                    status=SubmissionStatus.VERIFIED,
                    extracted_data=rc_data,
                    document_type_id=rc_doc_type.id,
                    verified_at=datetime.now(timezone.utc),
                )
                db.add(rc_sub)
                total_subs += 1

                if (i + 1) % 10 == 0:
                    print(f"  {i+1}/{students_per_year} students generated")
                    await db.flush()

            await db.flush()

        await db.commit()

        # ─── Summary ──────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("SEED COMPLETE")
        print("=" * 60)

        for tbl in ["school_years", "departments", "document_types", "extraction_schemas",
                     "school_year_requirements", "users", "students", "document_submissions"]:
            cnt = (await db.execute(text(f"SELECT COUNT(*) FROM {tbl}"))).scalar()
            print(f"  {tbl}: {cnt}")

        print(f"\n  New users created: {total_users}")
        print(f"  New students created: {total_students}")
        print(f"  New submissions created: {total_subs}")

        # Verify analytics tags
        for sname in schemas_to_tag:
            schema = (await db.execute(
                select(ExtractionSchema).where(ExtractionSchema.name == sname)
            )).scalar_one_or_none()
            if schema:
                ana_count = sum(1 for f in (schema.fields_json or [])
                                if isinstance(f, dict) and f.get("is_analytics"))
                print(f"  Schema '{sname}': {ana_count} analytics fields")

        # Verify SYR links
        for sy_name, sy in school_years.items():
            linked = (await db.execute(
                select(func.count(SchoolYearRequirement.id)).where(
                    SchoolYearRequirement.school_year_id == sy.id,
                    SchoolYearRequirement.extraction_schema_id != None,
                )
            )).scalar()
            print(f"  SY '{sy_name}': {linked} schemas linked via SYR")


if __name__ == "__main__":
    asyncio.run(main())
