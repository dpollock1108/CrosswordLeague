#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-gcp.sh  –  Build & deploy Crossword League to Google Cloud
#
# Prerequisites (one-time setup):
#   1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login && gcloud auth configure-docker <REGION>-docker.pkg.dev
#   3. gcloud services enable run.googleapis.com \
#        sqladmin.googleapis.com artifactregistry.googleapis.com \
#        secretmanager.googleapis.com
#   4. Create secrets in Secret Manager:
#        gcloud secrets create ADMIN_TOKEN --data-file=- <<< "your-token"
#        gcloud secrets create ANTHROPIC_API_KEY --data-file=- <<< "sk-ant-..."
#   5. Create Cloud SQL Postgres instance (db-f1-micro is cheapest):
#        gcloud sql instances create crossword-db \
#          --database-version=POSTGRES_15 --tier=db-f1-micro \
#          --region=us-central1
#        gcloud sql databases create crossword_league --instance=crossword-db
#        gcloud sql users create crossword --instance=crossword-db --password=<pw>
#   6. Create Artifact Registry repo:
#        gcloud artifacts repositories create crossword-league \
#          --repository-format=docker --location=us-central1
#   7. (Optional) Install Firebase CLI and run: firebase init hosting
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Load .env.deploy if present ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.deploy"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  echo "Loaded ${ENV_FILE}"
else
  echo "No ${ENV_FILE} found; using shell environment."
fi

# ── Required config ───────────────────────────────────────────────────────────
GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT (e.g. crossword-league-123)}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-crossword-league}"
AR_REPO="${AR_REPO:-crossword-league}"          # Artifact Registry repo name
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Cloud SQL connection name – find with: gcloud sql instances describe crossword-db
CLOUD_SQL_CONNECTION="${CLOUD_SQL_CONNECTION:?Set CLOUD_SQL_CONNECTION (project:region:instance)}"

# Public, build-time values. GOOGLE_CLIENT_ID is required or sign-in returns 503.
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID (…apps.googleusercontent.com)}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-*}"

# ── Derived values ────────────────────────────────────────────────────────────
AR_HOST="${GCP_REGION}-docker.pkg.dev"
IMAGE_URI="${AR_HOST}/${GCP_PROJECT}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Crossword League  →  Google Cloud Deploy    ║"
echo "╚══════════════════════════════════════════════╝"
echo "  Project  : ${GCP_PROJECT}"
echo "  Region   : ${GCP_REGION}"
echo "  Image    : ${IMAGE_URI}"
echo "  Cloud Run: ${SERVICE_NAME}"
echo ""

# ── Step 1: Build & push Docker image ────────────────────────────────────────
echo "▶ Building Docker image (platform linux/amd64)..."
# VITE_API_BASE stays empty: this same container serves the SPA, so the frontend
# talks to its own origin and there is no chicken-and-egg with the service URL.
docker buildx build \
  --platform linux/amd64 \
  --build-arg "VITE_API_BASE=" \
  --build-arg "VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  -t "${IMAGE_URI}" \
  "${ROOT_DIR}" \
  --push

echo "✓ Image pushed: ${IMAGE_URI}"

# ── Step 2: Deploy to Cloud Run ───────────────────────────────────────────────
echo ""
echo "▶ Deploying to Cloud Run (${SERVICE_NAME})..."

gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${GCP_REGION}" \
  --project="${GCP_PROJECT}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --add-cloudsql-instances="${CLOUD_SQL_CONNECTION}" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,ADMIN_TOKEN=ADMIN_TOKEN:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest" \
  --set-env-vars="GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},ALLOWED_ORIGINS=${ALLOWED_ORIGINS},DISABLE_ADMIN_AUTH=false"

echo ""
echo "✓ Cloud Run deploy complete."

# ── Step 3: Print the service URL ────────────────────────────────────────────
DEPLOYED_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${GCP_REGION}" \
  --project="${GCP_PROJECT}" \
  --format="value(status.url)")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Deploy complete!                            ║"
echo "╚══════════════════════════════════════════════╝"
echo "  API + App URL: ${DEPLOYED_URL}"
echo ""
echo "  Add this URL to the Google OAuth client's Authorized JavaScript origins,"
echo "  and set ALLOWED_ORIGINS to it, or sign-in will fail."
echo ""
echo "  To migrate your SQLite data to Cloud SQL, run:"
echo "    uv run python scripts/migrate_sqlite_to_pg.py \\"
echo "      --source sqlite:///./crossword.db \\"
echo "      --target \"postgresql+psycopg://crossword:<pw>@/<db>?host=/cloudsql/${CLOUD_SQL_CONNECTION}\""
