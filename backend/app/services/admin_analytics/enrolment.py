from __future__ import annotations

from uuid import UUID

from sqlalchemy import text

from ...database import SessionDep


async def get_enrolment_trends(
    db: SessionDep,
    from_year: int,
    to_year: int,
    department_id: UUID | None = None,
    department_ids: list[UUID] | None = None,
) -> dict:
    params: dict = {"from_year": from_year, "to_year": to_year}

    dept_clause = ""
    if department_ids:
        placeholders = ", ".join([f":dept_{i}" for i in range(len(department_ids))])
        dept_clause = f"AND s.program_id IN ({placeholders})"
        for i, did in enumerate(department_ids):
            params[f"dept_{i}"] = did
    elif department_id:
        dept_clause = "AND s.program_id = :department_id"
        params["department_id"] = department_id

    query = text(f"""
        SELECT
            sy.id::text AS school_year_id,
            sy.name AS school_year_name,
            COUNT(DISTINCT s.id) AS total_enrolled,
            COUNT(DISTINCT sub.student_id) FILTER (WHERE sub.status = 'verified')
                AS verified_students
        FROM school_years sy
        LEFT JOIN students s ON s.school_year_id = sy.id
        LEFT JOIN document_submissions sub ON sub.student_id = s.id
        WHERE EXTRACT(YEAR FROM sy.start_date) BETWEEN :from_year AND :to_year
          {dept_clause}
        GROUP BY sy.id, sy.name, sy.start_date
        ORDER BY sy.start_date
    """)

    rows = (await db.execute(query, params)).all()

    series = []
    for row in rows:
        total = row.total_enrolled or 0
        verified = row.verified_students or 0
        verification_rate = round(verified / total * 100, 1) if total else None
        series.append({
            "school_year_id": row.school_year_id,
            "school_year_name": row.school_year_name,
            "total_enrolled": total,
            "verified_students": verified,
            "verification_rate": verification_rate,
        })

    return {"series": series}
