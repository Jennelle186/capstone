from fastapi import APIRouter
from .requirements import router as requirements_router
from .uploads import router as uploads_router
from .classification import router as classification_router
from .extractions import router as extractions_router

router = APIRouter(tags=["documents"])
router.include_router(requirements_router)
router.include_router(uploads_router)
router.include_router(classification_router)
router.include_router(extractions_router)

from .schemas import SubmissionDetailResponse
from .uploads import DownloadUrlResponse

__all__ = [
    "router",
    "SubmissionDetailResponse",
    "DownloadUrlResponse",
]
