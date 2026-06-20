import logging
import os
import sys
from contextlib import asynccontextmanager

from typing_extensions import Annotated

from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import get_current_user
from .database import init_db
from .database import SessionDep
from .models import UserRole
from .routers.debug import router as debug_router
from .routers.documents import router as documents_router
from .routers.users import router as users_router
from .routers import admin
from .services.user_sync import ensure_user_row
from .services.clerk import update_user_personal_names, update_user_public_metadata
from .services.gcp_storage import ensure_bucket_cors

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure app-level loggers emit at INFO so background task logs are visible.
    # Uvicorn configures its own handlers on the `uvicorn.*` loggers with
    # propagate=False, so this does not interfere with access/error formatting.
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not root.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
        root.addHandler(handler)

    # For local dev convenience: set AUTO_CREATE_TABLES=true to create tables on startup.
    # This uses SQLAlchemy `Base.metadata.create_all` under the hood; Alembic is still the right tool for migrations.
    if os.getenv("AUTO_CREATE_TABLES", "").lower() in {"1", "true", "yes"}:
        await init_db()
    try:
        ensure_bucket_cors()
    except Exception as exc:
        logger.warning("Failed to configure GCS bucket CORS: %s", exc)
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(documents_router)
app.include_router(users_router)
app.include_router(debug_router)
app.include_router(admin.router)

CurrentUser = Annotated[dict, Depends(get_current_user)]

def _allowed_cors_origins() -> list[str]:
    defaults = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    }
    configured = {
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    }
    return sorted(defaults | configured)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/", tags=["root"])
async def read_root() -> dict:
    # Public endpoint: useful for health checks and connectivity tests.
    return {"message": "FastAPI server is running."}


class ProfileUpdateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)


@app.get("/api/me", tags=["auth"])
async def read_me(current_user: CurrentUser, db: SessionDep) -> dict:
    # Protected endpoint: returns claims from Clerk-verified session token.
    # Also upserts the user into our DB on first authenticated call.
    user = await ensure_user_row(db, current_user)
    await db.refresh(user, ["student"])
    student_number: str | None = None
    program_id: str | None = None
    if user.student is not None:
        student_number = user.student.student_number
        if user.student.program_id is not None:
            program_id = str(user.student.program_id)
    return {
        "userId": current_user.get("sub"),
        "sessionId": current_user.get("sid"),
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "middleName": user.middle_name,
        "student_number": student_number,
        "program_id": program_id,
        "role": getattr(user.role, "value", user.role),
    }


@app.patch("/api/me", tags=["auth"])
async def update_me(
    body: ProfileUpdateRequest,
    current_user: CurrentUser,
    db: SessionDep,
) -> dict:
    user = await ensure_user_row(db, current_user)

    # Update Clerk profile.
    clerk_user_id = current_user.get("sub")
    if clerk_user_id:
        await update_user_personal_names(
            clerk_user_id,
            first_name=body.first_name,
            last_name=body.last_name,
        )
        await update_user_public_metadata(
            clerk_user_id,
            {"middle_name": body.middle_name},
        )

    # Update local DB.
    user.first_name = body.first_name
    user.middle_name = body.middle_name
    user.last_name = body.last_name
    await db.commit()
    await db.refresh(user)

    return {
        "firstName": user.first_name,
        "middleName": user.middle_name,
        "lastName": user.last_name,
    }


@app.get("/api/todo", tags=["todos"])
async def get_todos(current_user: CurrentUser) -> dict:
    # Protected data endpoint: example user-scoped response.
    user_id = current_user.get("sub", "unknown-user")
    todos = [
        {"id": "1", "item": f"Welcome, {user_id}. Connect your real DB next."},
        {"id": "2", "item": "This response is protected by Clerk token verification."},
    ]
    return {"data": todos}
