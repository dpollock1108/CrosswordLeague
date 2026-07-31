#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-github-deploy.sh  –  One-time GCP setup for the GitHub Actions pipeline
#
# Run this ONCE, from a machine logged in as a project owner:
#     gcloud auth login
#     GCP_PROJECT=your-project GITHUB_REPO=dpollock1108/CrosswordLeague \
#       ./scripts/setup-github-deploy.sh
#
# It is idempotent — re-running it will not duplicate anything.
#
# What it creates:
#   • the APIs the pipeline needs
#   • an Artifact Registry repo for the container image
#   • a deploy service account, scoped to exactly what a deploy requires
#   • a Workload Identity pool/provider so GitHub Actions can authenticate
#     WITHOUT a long-lived JSON key, restricted to this one repository
#   • the Secret Manager secrets the running service reads
#
# It finishes by printing the GitHub secrets and variables to add.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT (e.g. crossword-league-123)}"
GITHUB_REPO="${GITHUB_REPO:?Set GITHUB_REPO as owner/repo (e.g. dpollock1108/CrosswordLeague)}"
GCP_REGION="${GCP_REGION:-us-central1}"
AR_REPO="${AR_REPO:-crossword-league}"
POOL="${POOL:-github-pool}"
PROVIDER="${PROVIDER:-github-provider}"
SA_NAME="${SA_NAME:-github-deployer}"

SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "${GCP_PROJECT}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Project        : ${GCP_PROJECT} (#${PROJECT_NUMBER})"
echo "Repository     : ${GITHUB_REPO}"
echo "Deploy account : ${SA_EMAIL}"
echo ""

# ── 1. APIs ──────────────────────────────────────────────────────────────────
echo "▶ Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  --project="${GCP_PROJECT}"

# ── 2. Artifact Registry ─────────────────────────────────────────────────────
echo "▶ Ensuring Artifact Registry repo..."
gcloud artifacts repositories describe "${AR_REPO}" \
  --location="${GCP_REGION}" --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${GCP_REGION}" \
  --project="${GCP_PROJECT}"

# ── 3. Deploy service account ────────────────────────────────────────────────
echo "▶ Ensuring deploy service account..."
gcloud iam service-accounts describe "${SA_EMAIL}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="GitHub Actions deployer" \
  --project="${GCP_PROJECT}"

# Deploy-time permissions only. Note this account deliberately has NO
# secretmanager.secretAccessor — the pipeline names secrets, it never reads them.
for ROLE in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" --condition=None --quiet >/dev/null
done

# Needed so `gcloud run deploy` can assign the runtime identity to the service.
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${GCP_PROJECT}" --quiet >/dev/null

# ── 4. Runtime permissions ───────────────────────────────────────────────────
# These belong to the identity the CONTAINER runs as, not the deployer.
echo "▶ Granting runtime permissions to ${RUNTIME_SA}..."
for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${GCP_PROJECT}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="${ROLE}" --condition=None --quiet >/dev/null
done

# ── 5. Workload Identity Federation ──────────────────────────────────────────
echo "▶ Ensuring Workload Identity pool..."
gcloud iam workload-identity-pools describe "${POOL}" \
  --location=global --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
gcloud iam workload-identity-pools create "${POOL}" \
  --location=global \
  --display-name="GitHub Actions" \
  --project="${GCP_PROJECT}"

echo "▶ Ensuring Workload Identity provider..."
# The attribute-condition is the security boundary: without it, ANY GitHub
# repository anywhere could exchange a token for this service account.
gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
  --location=global --workload-identity-pool="${POOL}" \
  --project="${GCP_PROJECT}" >/dev/null 2>&1 || \
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
  --location=global \
  --workload-identity-pool="${POOL}" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
  --project="${GCP_PROJECT}"

POOL_ID="$(gcloud iam workload-identity-pools describe "${POOL}" \
  --location=global --project="${GCP_PROJECT}" --format='value(name)')"

# Only workflows in this repo may impersonate the deployer.
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_REPO}" \
  --project="${GCP_PROJECT}" --quiet >/dev/null

PROVIDER_ID="$(gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
  --location=global --workload-identity-pool="${POOL}" \
  --project="${GCP_PROJECT}" --format='value(name)')"

# ── 6. Secrets ───────────────────────────────────────────────────────────────
# Created only if absent, so re-running never rotates a live secret behind your
# back. Values are piped straight into Secret Manager and never echoed.
ensure_secret() {
  local NAME="$1" VALUE="$2"
  if gcloud secrets describe "${NAME}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
    echo "  ${NAME}: already exists, left untouched"
  else
    printf '%s' "${VALUE}" | gcloud secrets create "${NAME}" \
      --data-file=- --project="${GCP_PROJECT}" >/dev/null
    echo "  ${NAME}: created"
  fi
}

echo "▶ Ensuring secrets..."
# A 512-bit random signing key. The app's default is "dev-secret-change-me",
# which would let anyone forge a session for any account.
ensure_secret JWT_SECRET "$(openssl rand -hex 64)"
ensure_secret ADMIN_TOKEN "$(openssl rand -hex 32)"

if ! gcloud secrets describe DATABASE_URL --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  echo ""
  echo "  DATABASE_URL is not set. It needs your Cloud SQL connection name and"
  echo "  the password for the 'crossword' database user."
  read -r -p "  Cloud SQL connection (project:region:instance): " SQL_CONN
  read -r -s -p "  Database password: " DB_PW
  echo ""
  ensure_secret DATABASE_URL \
    "postgresql+psycopg://crossword:${DB_PW}@/crossword_league?host=/cloudsql/${SQL_CONN}"
  unset DB_PW
else
  echo "  DATABASE_URL: already exists, left untouched"
  SQL_CONN="<your existing project:region:instance>"
fi

if ! gcloud secrets describe ANTHROPIC_API_KEY --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  echo ""
  echo "  ANTHROPIC_API_KEY is not set. Create it yourself with:"
  echo "    gcloud secrets create ANTHROPIC_API_KEY --data-file=- --project=${GCP_PROJECT}"
  echo "  (paste the key, then Ctrl-D)"
fi

# ── 7. What to put in GitHub ─────────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════════════════════════════════
 Setup complete. Add the following to
 https://github.com/${GITHUB_REPO}/settings/secrets/actions

 Secrets (Settings → Secrets and variables → Actions → Secrets):
   GCP_WORKLOAD_IDENTITY_PROVIDER
     ${PROVIDER_ID}
   GCP_DEPLOY_SERVICE_ACCOUNT
     ${SA_EMAIL}

 Variables (same page → Variables tab):
   GCP_PROJECT           ${GCP_PROJECT}
   CLOUD_SQL_CONNECTION  ${SQL_CONN}
   GOOGLE_CLIENT_ID      <your OAuth client ID, ending .apps.googleusercontent.com>
   ALLOWED_ORIGINS       https://your-domain.com

 Neither of those "secrets" is a credential — they are just resource names.
 No long-lived key is stored in GitHub at all.

 Still to do by hand:
   • Add your production URL to the Google OAuth client's
     "Authorized JavaScript origins" or sign-in will fail.
   • Set ALLOWED_ORIGINS to your real domain (it defaults to "*").
═══════════════════════════════════════════════════════════════════════════
EOF
