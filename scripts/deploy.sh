#!/usr/bin/env bash
set -euo pipefail

# Load .env.deploy if present
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.deploy"
if [ -f "${ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
  echo "Loaded ${ENV_FILE}"
else
  echo "No ${ENV_FILE} found; using shell environment/defaults."
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
ECR_REPO="${ECR_REPO:-crossword-league}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FRONTEND_BUCKET="${FRONTEND_BUCKET:?Set FRONTEND_BUCKET (S3 bucket for frontend assets)}"
VITE_API_BASE="${VITE_API_BASE:-http://localhost:8000}"

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Building frontend with VITE_API_BASE=${VITE_API_BASE}"
pushd "${ROOT_DIR}/frontend" >/dev/null
npm install
VITE_API_BASE="${VITE_API_BASE}" npm run build
popd >/dev/null

echo "Syncing frontend to s3://${FRONTEND_BUCKET}"
aws s3 sync "${ROOT_DIR}/frontend/dist/" "s3://${FRONTEND_BUCKET}" --delete --cache-control "max-age=31536000"
# Ensure index.html is not aggressively cached
aws s3 cp "${ROOT_DIR}/frontend/dist/index.html" "s3://${FRONTEND_BUCKET}/index.html" \
  --cache-control "no-cache, must-revalidate" --content-type "text/html"

echo "Ensuring ECR repo ${ECR_REPO} exists"
aws ecr describe-repositories --repository-names "${ECR_REPO}" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "${ECR_REPO}" --image-scanning-configuration scanOnPush=true >/dev/null

# echo "Logging in to ECR"
# aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# echo "Building and pushing backend image ${ECR_URI}:${IMAGE_TAG} (platform linux/amd64)"
# Use buildx to produce an amd64 image even on arm hosts (e.g., Apple Silicon)
# docker buildx build --platform linux/amd64 -t "${ECR_URI}:${IMAGE_TAG}" "${ROOT_DIR}" --push

cat <<EOF
Done.
- Frontend synced to s3://${FRONTEND_BUCKET}
- Image pushed: ${ECR_URI}:${IMAGE_TAG}

Next: update your ECS task definition/service to use ${ECR_URI}:${IMAGE_TAG}
and set env vars (DATABASE_URL, ADMIN_TOKEN, ALLOWED_ORIGINS, etc.). Point your
CloudFront/Route53 records at the S3 bucket and ALB respectively.
EOF
