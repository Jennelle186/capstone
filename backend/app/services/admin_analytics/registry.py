from __future__ import annotations

from sqlalchemy import select

from ...database import SessionDep
from ...models import AnalyticsDimension


async def get_registry_metadata(db: SessionDep) -> dict[str, dict]:
    """Return a lookup of active ``canonical_key`` to curated registry metadata.

    Each value has ``label``, ``field_type``, and ``analytics_group`` taken from
    the ``analytics_dimensions`` table. Analytics services use this as the
    source of truth for display metadata instead of deriving labels from the
    schema field definitions.
    """
    dimensions = (
        await db.execute(
            select(AnalyticsDimension).where(
                AnalyticsDimension.is_active == True  # noqa: E712
            )
        )
    ).scalars().all()

    return {
        dim.canonical_key.lower(): {
            "label": dim.label,
            "field_type": dim.field_type,
            "analytics_group": dim.analytics_group,
        }
        for dim in dimensions
    }
