from __future__ import annotations

from pydantic import BaseModel


class RetentionSettingsResponse(BaseModel):
    # None means logs are kept forever.
    retention_days: int | None
    options: list[int]


class RetentionUpdateRequest(BaseModel):
    # None means keep forever. Other values are checked in the service.
    retention_days: int | None


class PurgeRequest(BaseModel):
    older_than_days: int


class PurgeResponse(BaseModel):
    deleted: int


class OlderThanCountResponse(BaseModel):
    # Read-only preview: how many entries a purge of this many days would delete.
    days: int
    count: int
