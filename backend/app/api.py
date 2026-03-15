import os
from contextlib import asynccontextmanager

from typing_extensions import Annotated

from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user
from .database import init_db
from .database import SessionDep
from .models import UserRole
from .routers.debug import router as debug_router
from .routers.users import router as users_router
from .services.user_sync import ensure_user_row


@asynccontextmanager
async def lifespan(app: FastAPI):
    # For local dev convenience: set AUTO_CREATE_TABLES=true to create tables on startup.
    # This uses SQLAlchemy `Base.metadata.create_all` under the hood; Alembic is still the right tool for migrations.
    if os.getenv("AUTO_CREATE_TABLES", "").lower() in {"1", "true", "yes"}:
        await init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(users_router)
app.include_router(debug_router)

CurrentUser = Annotated[dict, Depends(get_current_user)]

origins = [
    "http://localhost:5173",
    "localhost:5173",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/", tags=["root"])
async def read_root() -> dict:
    # Public endpoint: useful for health checks and connectivity tests.
    return {"message": "FastAPI server is running."}


@app.get("/api/me", tags=["auth"])
async def read_me(current_user: CurrentUser, db: SessionDep) -> dict:
    # Protected endpoint: returns claims from Clerk-verified session token.
    # Also upserts the user into our DB on first authenticated call.
    user = await ensure_user_row(db, current_user)
    return {
        "userId": current_user.get("sub"),
        "sessionId": current_user.get("sid"),
        "email": user.email,
        "role": getattr(user.role, "value", user.role),
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
