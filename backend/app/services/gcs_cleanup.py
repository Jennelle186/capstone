"""GCS orphan cleanup.

Scans the document-upload prefixes (``staging/``, ``production/``) and the
branding prefix, diffs them against the keys referenced by the database
(``document_submissions.file_key`` and ``branding_settings.logo_file_key``), and
returns (or deletes) the orphans left behind by failed uploads or hard-deleted
rows that never cleaned up their object.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from ..database import SessionDep
from ..models import BrandingSettings, DocumentSubmission
from .gcp_storage import delete_file_batch, list_blobs

logger = logging.getLogger(__name__)

_DEFAULT_PREFIXES = ("staging/", "production/", "branding/")


async def collect_referenced_keys(db: SessionDep) -> set[str]:
    """Return every GCS key the database currently points at."""
    keys: set[str] = set()

    submission_keys = (
        await db.execute(
            select(DocumentSubmission.file_key).where(DocumentSubmission.file_key != "")
        )
    ).scalars().all()
    for key in submission_keys:
        if key:
            keys.add(key)

    branding = await db.get(BrandingSettings, 1)
    if branding and branding.logo_file_key:
        keys.add(branding.logo_file_key)

    return keys


def _scan_prefixes(prefixes: tuple[str, ...]) -> list[str]:
    keys: list[str] = []
    for prefix in prefixes:
        keys.extend(list_blobs(prefix=prefix))
    return keys


async def find_orphaned_keys(db: SessionDep, prefixes: tuple[str, ...] | None = None) -> list[str]:
    """Return GCS keys under ``prefixes`` that no DB row references."""
    prefixes = prefixes or _DEFAULT_PREFIXES
    referenced = await collect_referenced_keys(db)
    all_keys = await asyncio.to_thread(_scan_prefixes, prefixes)
    return [key for key in all_keys if key not in referenced]


async def run_cleanup(
    db: SessionDep,
    dry_run: bool,
    prefixes: tuple[str, ...] | None = None,
) -> dict:
    """Find orphaned GCS objects and (unless ``dry_run``) delete them.

    Returns a summary: scanned count, orphaned keys, and how many were removed.
    """
    referenced = await collect_referenced_keys(db)
    prefixes = prefixes or _DEFAULT_PREFIXES
    all_keys = await asyncio.to_thread(_scan_prefixes, prefixes)
    orphaned = [key for key in all_keys if key not in referenced]

    failed: list[str] = []
    deleted = 0
    if orphaned and not dry_run:
        failed = await asyncio.to_thread(delete_file_batch, orphaned)
        deleted = len(orphaned) - len(failed)
    logger.info(
        "GCS cleanup dry_run=%s scanned=%d orphaned=%d deleted=%d failed=%d",
        dry_run,
        len(all_keys),
        len(orphaned),
        deleted,
        len(failed),
    )

    return {
        "dry_run": dry_run,
        "scanned": len(all_keys),
        "orphaned_count": len(orphaned),
        "deleted_count": deleted,
        "failed_keys": failed,
        "orphaned_keys": orphaned,
    }
