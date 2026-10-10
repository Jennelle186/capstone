FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY backend/llm_metrics.py .
COPY deploy/entrypoint.sh ./entrypoint.sh

RUN chmod +x /app/backend/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/backend/entrypoint.sh"]