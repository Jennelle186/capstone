"""Admin GCS orphan cleanup endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...database import SessionDep
from ...rbac import require_admin
from ...services.activity_log import record_activity
from ...services.gcs_cleanup import run_cleanup

router = APIRouter(prefix="/gcs")


class GcsCleanupRequest(BaseModel):
    dry_run: bool = True


class GcsCleanupResponse(BaseModel):
    dry_run: bool
    scanned: int
    orphaned_count: int
    deleted_count: int
    failed_keys: list[str]
    orphaned_keys: list[str]


@router.post("/cleanup", response_model=GcsCleanupResponse)
async def cleanup_orphaned_files(
    body: GcsCleanupRequest,
    current_user: dict = Depends(require_admin),
    db: SessionDep = None,
) -> GcsCleanupResponse:
    """Find and (optionally) delete GCS objects no longer referenced by the DB.

    Defaults to ``dry_run=true`` so nothing is deleted unless explicitly asked.
    """
    result = await run_cleanup(db, dry_run=body.dry_run)

    # Dry runs only report, so they are not logged. A real run that removed files is.
    if not body.dry_run and result["deleted_count"] > 0:
        await record_activity(
            db,
            current_user,
            action="delete",
            entity_type="gcs_cleanup",
            entity_label="Orphaned storage files",
            new_values={
                "scanned": result["scanned"],
                "orphaned_count": result["orphaned_count"],
                "deleted_count": result["deleted_count"],
                "failed_count": len(result["failed_keys"]),
            },
        )
        await db.commit()

    return GcsCleanupResponse(**result)
