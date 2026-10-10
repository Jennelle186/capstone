#!/bin/sh
set -e

echo "Waiting for database to become reachable..."
python - <<'PY'
import asyncio
import os
import sys

import asyncpg

url = os.getenv("DATABASE_URL", "")
# SQLAlchemy scheme is not accepted by asyncpg.connect directly.
if url.startswith("postgresql+asyncpg://"):
    url = url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def main() -> int:
    for attempt in range(30):
        try:
            conn = await asyncpg.connect(url, timeout=5)
            await conn.close()
            return 0
        except Exception:
            await asyncio.sleep(2)
    print("Database not reachable after 60s", file=sys.stderr)
    return 1


sys.exit(asyncio.run(main()))
PY

echo "Running database migrations..."
alembic upgrade head

echo "Starting API server..."
exec uvicorn app.api:app --host 0.0.0.0 --port 8000