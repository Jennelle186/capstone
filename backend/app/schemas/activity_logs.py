from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityLogItem(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str | None = None
    entity_label: str | None = None
    school_year_id: str | None = None
    actor_user_id: str | None = None
    actor_clerk_user_id: str | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    previous_values: dict[str, Any] | None = None
    new_values: dict[str, Any] | None = None
    created_at: datetime


class ActivityLogListResponse(BaseModel):
    items: list[ActivityLogItem]
    total: int
