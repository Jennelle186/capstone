from __future__ import annotations

import os
from pathlib import Path
from typing import AsyncGenerator
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from typing import Annotated
from fastapi import Depends

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_PATH)


def build_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "enrollment_docs")

    if password:
        auth = f"{quote_plus(user)}:{quote_plus(password)}@"
    else:
        auth = f"{quote_plus(user)}@"

    return f"postgresql+asyncpg://{auth}{host}:{port}/{name}"


DATABASE_URL = build_database_url()
# Async SQLAlchemy engine for Postgres (asyncpg driver).
engine: AsyncEngine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def init_db() -> None:
    """
    Development helper: creates tables from the ORM models.

    Notes:
    - This only creates missing tables; it does not migrate/alter existing ones.
    - Prefer Alembic for all schema migrations.
    """
    # Import models so they register themselves on Base.metadata before create_all runs.
    from . import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
