# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# VITE_API_BASE is injected at build time via --build-arg
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}

RUN npm run build

# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies from pyproject.toml
RUN pip install --no-cache-dir --upgrade pip

COPY pyproject.toml ./
# Install all declared dependencies (fastapi, sqlmodel, uvicorn, anthropic,
# python-multipart, python-dotenv) plus the postgres driver
RUN pip install --no-cache-dir \
        "fastapi>=0.115.0" \
        "sqlmodel>=0.0.22" \
        "uvicorn>=0.30.6" \
        "anthropic>=0.40.0" \
        "python-multipart>=0.0.9" \
        "python-dotenv>=1.0.0" \
        "psycopg[binary]>=3.2.1"

# Copy application code
COPY app ./app
COPY main.py .

# Copy compiled frontend so FastAPI can serve it as static files
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8080

# Cloud Run injects PORT env var; fall back to 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
