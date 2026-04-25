import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.database import build_database_url


def test_connection() -> None:
    asyncio.run(_test_connection())


async def _test_connection() -> None:
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
    asyncio.run(_test_connection())
