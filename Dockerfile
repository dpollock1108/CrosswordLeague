# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# Vite inlines these at build time, so they must be present here rather than as
# Cloud Run runtime env vars. Neither is a secret: VITE_API_BASE is empty so the
# SPA talks to its own origin, and the Google client ID is public by design (it
# ships in the page for every visitor to see).
ARG VITE_API_BASE=""
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_API_BASE=${VITE_API_BASE} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

RUN npm run build

# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies come from uv.lock, not a hand-written list. An earlier version of
# this file duplicated the dependency list inline and drifted out of sync with
# pyproject.toml — the image shipped without python-jose, so `from jose import`
# in app/auth.py killed the container on startup. Installing from the lock file
# makes that class of bug impossible and pins exact versions.
COPY --from=ghcr.io/astral-sh/uv:0.9.2 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local

COPY pyproject.toml uv.lock ./
# --no-install-project: the app is run from /app as a plain module tree, it is
# not packaged, so only its dependencies need installing.
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY app ./app
COPY main.py .
COPY alembic.ini .

# Copy compiled frontend so FastAPI can serve it as static files
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8080

# Cloud Run injects PORT env var; fall back to 8080
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
