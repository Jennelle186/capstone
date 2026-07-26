from fastapi import APIRouter

from .access_control import router as access_control_router
from .extractions import router as extractions_router
from .extraction_schemas import router as extraction_schemas_router
from .adviser_invitations import router as adviser_invitation_router
from .adviser_management import router as adviser_management_router
from .departments import router as departments_router
from .document_management import router as document_management_router
from .reports import router as reports_router
from .requirements import router as requirements_router
from .school_years import router as school_years_router
from .student_management import router as student_management_router
from .users import router as users_router
from .analytics import router as analytics_router

# Root admin router. All admin sub-domains are mounted here under `/api/admin`.
router = APIRouter(prefix="/api/admin", tags=["admin"])

# User and role management routes.
router.include_router(users_router)
# School year configuration routes.
router.include_router(school_years_router)
# Adviser invitation lifecycle routes.
router.include_router(adviser_invitation_router)
# Adviser management namespace (endpoints to be added incrementally).
router.include_router(adviser_management_router)
# Department management namespace (endpoints to be added incrementally).
router.include_router(departments_router)
# Document types and school-year requirements namespace.
router.include_router(document_management_router)
# Downloadable CSV reports (students, advisers).
router.include_router(reports_router)
# Requirement slot configuration (solo + group slots).
router.include_router(requirements_router)
# Extraction schema namespace (formerly admission form schemas).
router.include_router(extraction_schemas_router)
# Admin sandbox extraction endpoint.
router.include_router(extractions_router)
# Access control namespace (endpoints to be added incrementally).
router.include_router(access_control_router)
# Student management namespace.
router.include_router(student_management_router)
# Analytics namespace.
router.include_router(analytics_router)
