from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import UUID

from dotenv import load_dotenv
from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from .snapshot import get_extraction_analytics

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior institutional intelligence analyst for a university data engine.
Analyze the provided dashboard telemetry for the target department and school year.

DATA LAYOUT HINTS:
- Categories are tagged in brackets: e.g., [Demographics], [Academic Background], [CET Scores].
- Numeric fields (like GPAs or scores) report mean, median, range, and count — treat higher values as superior performance.
- Boolean fields show true/false splits.
- Distribution fields show the top values by frequency (label: count, percentage).
- Document tracking metrics display compliance per document type. Look for "Missing" or "Pending" spikes to catch throughput bottlenecks.

CRITICAL INSTRUCTIONS:
- Create numbered sections with bold titles that map exactly to the dynamic brackets present in the payload.
- Synthesize correlations across groups (e.g., cross-reference lower [CET Scores] brackets with specific [Academic Background] strands to isolate performance gaps).
- Base your analysis strictly on the provided data. Do not invent or extrapolate unlisted numbers.

OUTPUT FORMAT:
1. **[Dynamic Group Title 1]**: Correlated trend findings and student performance implications.
2. **[Dynamic Group Title 2]**: Correlated trend findings and student performance implications.
3. **ADVISORY NOTE**: One highly specific, actionable operational recommendation for admissions routing, student support interventions, or registrar resource allocation.

STRICT CONSTRAINT: Total response must be under 150 words. No conversational filler. Proceed directly to Section 1."""


def _compress_fields(fields: list[dict]) -> list[dict]:
    compressed: list[dict] = []
    for f in fields:
        entry: dict = {
            "label": f.get("label", ""),
            "type": f.get("analytics_mode", ""),
            "group": f.get("analytics_group") or "Ungrouped",
        }

        mode = f.get("analytics_mode")
        if mode == "distribution":
            dist = f.get("distribution", [])
            top = sorted(dist, key=lambda x: x["count"], reverse=True)[:5]
            entry["top_values"] = [
                f'{d["label"]}: {d["count"]} ({d["percentage"]}%)' for d in top
            ]
            entry["unique_values"] = len(dist)
            entry["student_count"] = f.get("student_count", 0)
        elif mode == "numeric_summary":
            entry["mean"] = f.get("mean")
            entry["median"] = f.get("median")
            entry["min"] = f.get("min")
            entry["max"] = f.get("max")
            entry["count"] = f.get("count", 0)
        elif mode == "boolean_summary":
            t = f.get("true", {})
            fa = f.get("false", {})
            entry["true_count"] = t.get("count", 0) if isinstance(t, dict) else 0
            entry["false_count"] = fa.get("count", 0) if isinstance(fa, dict) else 0
            entry["total"] = f.get("count", 0)

        compressed.append(entry)
    return compressed


def _build_prompt(
    school_year_name: str,
    department_name: str,
    total_students: int,
    verified_submissions: int,
    compressed_fields: list[dict],
    compliance: list[dict] | None = None,
) -> str:
    lines = [
        f"Dashboard snapshot for {department_name} during S.Y. {school_year_name}",
        f"Total students: {total_students}",
        f"Verified submissions: {verified_submissions}",
        "",
        "Document compliance:",
    ]

    if compliance:
        for item in compliance:
            scope = f" ({', '.join(item['classification_scope'])})" if item.get("classification_scope") else ""
            lines.append(
                f"  - {item['document_type']}{scope}: "
                f"{item['verified']} verified, {item['pending']} pending, "
                f"{item['missing']} missing / {item['eligible_students']} eligible "
                f"({item['verification_rate']}%)"
            )

    lines.extend(["", "Field data:"])
    for field in compressed_fields:
        label = field["label"]
        mode = field["type"]
        group_tag = f"[{field.get('group', 'Ungrouped')}]"
        if mode == "distribution":
            top = ", ".join(field.get("top_values", []))
            lines.append(f"  - {group_tag} {label} (distribution, {field.get('unique_values', 0)} unique values): {top}")
        elif mode == "numeric_summary":
            m = field.get("mean")
            med = field.get("median")
            mn = field.get("min")
            mx = field.get("max")
            lines.append(f"  - {group_tag} {label} (numeric, n={field.get('count', 0)}): mean={m}, median={med}, range={mn}-{mx}")
        elif mode == "boolean_summary":
            t = field.get("true_count", 0)
            f = field.get("false_count", 0)
            lines.append(f"  - {group_tag} {label} (boolean): true={t}, false={f}")
        else:
            lines.append(f"  - {group_tag} {label} ({mode})")

    return "\n".join(lines)


async def generate_insights(
    db: SessionDep,
    school_year_id: UUID,
    department_id: UUID | None = None,
    department_ids: list[UUID] | None = None,
) -> str:
    snapshot = await get_extraction_analytics(db, school_year_id, department_id, department_ids)

    school_year_name = snapshot.get("school_year_name", "")
    department_name = "All Departments"
    if department_ids:
        from ...models import Department
        depts = await db.execute(
            select(Department).where(Department.id.in_(department_ids))
        )
        dept_names = [d.name for d in depts.scalars().all()]
        if dept_names:
            department_name = ", ".join(dept_names)
    elif department_id:
        from ...models import Department
        dept = await db.get(Department, department_id)
        if dept:
            department_name = dept.name

    compressed = _compress_fields(snapshot.get("fields", []))
    prompt_text = _build_prompt(
        school_year_name=school_year_name,
        department_name=department_name,
        total_students=snapshot.get("total_students", 0),
        verified_submissions=snapshot.get("total_verified_submissions", 0),
        compressed_fields=compressed,
        compliance=snapshot.get("document_compliance"),
    )

    project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    model_name = os.getenv("VERTEX_AI_MODEL")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

    if not model_name:
        logger.warning("VERTEX_AI_MODEL not set; skipping Gemini call")
        return "AI insights unavailable: VERTEX_AI_MODEL is not configured."

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[types.Part.from_text(text=prompt_text)],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.2,
                http_options=types.HttpOptions(timeout=30_000),
            ),
        )
        return response.text
    except Exception as exc:
        logger.error("Gemini insight generation failed: %s", exc)
        return "AI insights temporarily unavailable. Please try again later."
