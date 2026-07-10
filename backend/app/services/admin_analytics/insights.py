from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import UUID

from dotenv import load_dotenv
from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import SessionDep
from .snapshot import get_extraction_analytics

load_dotenv(Path(__file__).resolve().parents[3] / ".env")

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior institutional intelligence analyst for a university document management system.

Analyze the provided dashboard data for the given department and school year. Fields are tagged with their analytics group in brackets such as [Demographics], [Academic Background], [CET Scores]. The specific groups vary per configuration.

Create numbered sections with bold titles that reflect the actual groups present in the data. For example:
1. **[title based on first group]**: findings...
2. **[title based on second group]**: findings...

End with a final section:
3. **ADVISORY NOTE**: One operational recommendation for admissions processing or registrar resource allocation.

Keep your entire response under 150 words. Use no conversational filler."""


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
) -> str:
    lines = [
        f"Dashboard snapshot for {department_name} during S.Y. {school_year_name}",
        f"Total students: {total_students}",
        f"Verified submissions: {verified_submissions}",
        "",
        "Field data:",
    ]
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
) -> str:
    snapshot = await get_extraction_analytics(db, school_year_id, department_id)

    school_year_name = snapshot.get("school_year_name", "")
    department_name = "All Departments"
    if department_id:
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
