import asyncio
import os
from urllib.parse import quote_plus

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


if load_dotenv:
    load_dotenv()


def build_database_url() -> str:
    # DATABASE URL from .env 
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "enrollment_docs")

    # Allow empty password for setups that use trust/peer auth locally.
    if password:
        auth = f"{quote_plus(user)}:{quote_plus(password)}@"
    else:
        auth = f"{quote_plus(user)}@"

    return f"postgresql+asyncpg://{auth}{host}:{port}/{name}"


async def test_connection() -> None:
    database_url = build_database_url()
    engine = create_async_engine(database_url)

    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("SELECT 1"))
            _ = result.scalar_one()
            print("OK: Database connection successful")
    except Exception as e:
        print(f"ERROR: Connection failed: {e}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_connection())
