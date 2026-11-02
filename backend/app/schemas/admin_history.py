from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminHistoryEvent(BaseModel):
    # invited | accepted | revoked | promoted | demoted | removed
    type: str
    at: datetime
    actor_name: str | None = None


class AdminHistoryPerson(BaseModel):
    email: str | None = None
    name: str | None = None
    # admin | invited | revoked | demoted | removed
    status: str
    events: list[AdminHistoryEvent]
