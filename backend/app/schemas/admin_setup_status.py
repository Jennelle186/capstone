from __future__ import annotations

from pydantic import BaseModel


class SetupStep(BaseModel):
    key: str
    done: bool
    count: int
    required: bool


class AdminSetupStatusResponse(BaseModel):
    active_school_year_name: str | None = None
    core_complete: bool
    steps: list[SetupStep]
