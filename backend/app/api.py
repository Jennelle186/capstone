from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user


app = FastAPI()

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
async def read_me(current_user: dict = Depends(get_current_user)) -> dict:
    # Protected endpoint: returns claims from Clerk-verified session token.
    return {
        "userId": current_user.get("sub"),
        "sessionId": current_user.get("sid"),
        "email": current_user.get("email"),
    }


@app.get("/api/todo", tags=["todos"])
async def get_todos(current_user: dict = Depends(get_current_user)) -> dict:
    # Protected data endpoint: example user-scoped response.
    user_id = current_user.get("sub", "unknown-user")
    todos = [
        {"id": "1", "item": f"Welcome, {user_id}. Connect your real DB next."},
        {"id": "2", "item": "This response is protected by Clerk token verification."},
    ]
    return {"data": todos}
