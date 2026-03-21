## Crossword League

Track NYT Mini times for friends, award points, and publish a leaderboard. Backend is FastAPI + SQLModel (SQLite by default) managed with `uv`.

### Stack
- Python 3.9+ with `uv` for dependency + virtualenv management
- FastAPI for the HTTP API
- SQLModel + SQLite for persistence (swap `DATABASE_URL` to use Postgres/MySQL)
- Scoring helper that ranks each puzzle date using a configurable points table

### Quickstart
```bash
# Sync dependencies (updates uv.lock; may need network approval)
uv sync

# Run the API (reload on code changes)
uv run python main.py
```
The server defaults to `http://localhost:8000`.

### Run tests
```bash
uv run pytest
```

### Configuration
Set these environment variables (consider a `.env` file):
- `DATABASE_URL` — defaults to `sqlite:///./crossword.db`
- `ADMIN_TOKEN` — required for admin endpoints. Requests must include header `X-Admin-Token: <value>`.
- `POINTS_TABLE` — comma-separated points per rank (default `10,8,6,4,2`). Extra players get 1 point.
- `ALLOW_DEFAULT_ADMIN_TOKEN` — set to `true` only for local dev if you want to use the default token.
- `DISABLE_ADMIN_AUTH` — set to `true` to temporarily skip admin auth checks (dev-only).

How to set them:
- Quick shell export for one session: `export DATABASE_URL=sqlite:///./crossword.db` (use `set` on Windows).
- Persistent via `.env` in the repo root (auto-loaded by uv):  
  ```
  DATABASE_URL=sqlite:///./crossword.db
  ADMIN_TOKEN=replace-me
  POINTS_TABLE=10,8,6,4,2
  ALLOW_DEFAULT_ADMIN_TOKEN=false
  ```
- Frontend base URL: create `frontend/.env` with `VITE_API_BASE=http://localhost:8000` (or your deployed API).

### API overview
- `GET /health` — service status
- `GET /players` — list players
- `POST /players` — create player (admin)
- `POST /results` — bulk upsert puzzle results (admin)
- `POST /results/single` — upsert one puzzle result (admin)
- `GET /leaderboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — leaderboard over a window (defaults to the last 30 days)
- `GET /players/{player_id}/stats` — stats for a single player
- `GET /wall-of-shame?scope=week|month&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — who skipped puzzles in the window. Defaults: current week (Mon–Sun) or current month; pass both dates to override.

### Data model
- **Player** — name, optional handle/email/nyt_username, created_at
- **PuzzleResult** — player_id, puzzle_date, seconds, optional points_override/note/source

Each `(player_id, puzzle_date)` pair is unique. Results are grouped per date; points are assigned by rank using the configured points table unless `points_override` is provided.

### Scoring
For each puzzle date:
- Base points by finish time: 1 for finishing, 2 (<120s), 3 (<90s), 4 (<60s), 5 (<=30s).
- First place (ties included) gets +1 bonus.
- If `points_override` is set for a result, that value is used instead.
Leaderboard totals sum points across the requested date range and include average/best times.

### Next steps
- Harden admin auth (sessioned UI instead of raw token) and add bulk CSV import helpers.
- Add API tests that exercise the FastAPI routes with dependency overrides.
- Polish the frontend (loading states, empty states, deploy scripts).

### Frontend sketch
- Use Vite + React + TypeScript with a small client for the FastAPI endpoints (set `VITE_API_BASE` in `.env`).
- Pages: public leaderboard, player detail (times + stats), and a lightweight admin upload form for bulk results.
- Reuse `POINTS_TABLE` from the API when rendering the leaderboard to keep scoring consistent.

#### Frontend quickstart
```bash
cd frontend
npm install   # or pnpm/yarn if preferred
npm run dev   # defaults to http://localhost:5173
```
Set `VITE_API_BASE` in `frontend/.env` to point at your API (defaults to `http://localhost:8000`).

Frontend pages:
- Results Dashboard — weekly (Sun–Sat) or monthly leaderboard with prev/current/next navigation.
- Player Profile — per-player stats, best weekday, and average per weekday.
- Admin Panel — create players, add a single result, paste per-day times, or upload JSON/CSV bulk results (requires `X-Admin-Token`).

Seed data (optional):
```bash
uv run python -m app.seed
```
Adds a few players and ~3 weeks of daily results into the configured DB (default SQLite).

### Deploy checklist (AWS)
- Build the backend image: `docker build -t crossword-league .` (uses `Dockerfile`).
- Use Postgres in production: create an RDS instance and set `DATABASE_URL=postgresql+psycopg://...` plus `ADMIN_TOKEN` and `ALLOWED_ORIGINS=https://your-frontend-domain`.
- Push the image to ECR, run it on ECS Fargate behind an ALB; set health check to `/health`.
- Build the frontend (`npm run build` in `frontend/`) and host `frontend/dist` on S3 behind CloudFront (or serve from the same ALB path if preferred).
- Point DNS (Route 53) to CloudFront (frontend) and the ALB (API) and attach ACM certificates for HTTPS.

#### Deploy script (AWS CLI)
`scripts/deploy.sh` wraps a simple flow: build frontend, sync to S3, build/push backend image to ECR.

Prereqs: AWS CLI configured, Docker running, npm installed.

Env vars to set before running:
- `AWS_ACCOUNT_ID` (required)
- `AWS_REGION` (default `us-east-1`)
- `FRONTEND_BUCKET` (required; S3 bucket for the built frontend)
- `ECR_REPO` (default `crossword-league`)
- `IMAGE_TAG` (default `latest`)
- `VITE_API_BASE` (baked into the frontend build; e.g. `https://api.your-domain.com`)

Usage:
```bash
AWS_ACCOUNT_ID=123456789012 \
AWS_REGION=us-east-1 \
FRONTEND_BUCKET=my-crossword-frontend \
VITE_API_BASE=https://api.example.com \
IMAGE_TAG=$(git rev-parse --short HEAD) \
./scripts/deploy.sh
```

Tip: create `.env.deploy` (same keys as above) in the repo root; the script will auto-load it.
After it finishes: update your ECS task definition/service to use the pushed image, ensure env vars (`DATABASE_URL`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS`, etc.) are set, and keep CloudFront/ALB + DNS pointing to your frontend/API.

#### AWS quickstart guide (if this is all new)
High level (and order): set up infra first, then build/push, then point ECS to the image.
1) Host static frontend on S3 (private) fronted by CloudFront.
2) Run the FastAPI backend on ECS Fargate behind an ALB.
3) Store data in RDS Postgres.
4) Build/push image + sync frontend (deploy script) **after** ECR exists and you know your API URL.
Route 53/custom domains are optional (you can start with AWS-provided hostnames).

1) **(Optional) Set up your domain + HTTPS**
   - If you have a domain (Route 53 or another registrar): request ACM certs in the ALB’s region for `api.yourdomain.com` and your frontend host (e.g., `www.yourdomain.com`). Otherwise, you can use AWS-provided hostnames (ALB DNS for API; CloudFront domain for frontend). You can defer this until after the first deploy.

2) **Create an S3 bucket for the frontend**
   - Make a bucket (e.g., `my-crossword-frontend`). Keep it **private** and serve via CloudFront (recommended). If you skip CloudFront, you can enable static website hosting + public read, but HTTPS and caching are better via CloudFront.

3) **Create an RDS Postgres instance**
   - Smallest instance is fine to start. Keep it in private subnets. Note the host, port, db name, username, password.
   - Build `DATABASE_URL` as `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`.

4) **Provision VPC + ECS Fargate + ALB (simplest option)**
   - Use the ECS console “Create service” wizard with Fargate + Application Load Balancer.
   - Networking: prefer a VPC with both public subnets (for the ALB) and private subnets (for ECS tasks/RDS). If you don’t have one, create a new VPC with public + private subnets (and a NAT gateway) first.
   - Pick or create a VPC with two public subnets (for ALB) and two private subnets (for ECS/RDS).
   - Create an ALB target group with health check path `/health` and port `8000`.
   - Create a task definition that runs the container:
     - Image: your ECR image URI (after you push it). You can fill this in after step 5 when the image exists.
     - Port mapping: 8000 TCP.
     - Env vars: `DATABASE_URL`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS=https://www.example.com` (your frontend origin), plus anything else you use.
   - Create the service with desired count 1–2, attach to the ALB listener (HTTPS 443 with your ACM cert; redirect HTTP 80 to 443).

5) **Build + push code, sync frontend** (run after you know your API URL and have the S3 bucket + ECR repo)
   - Make sure your ECR repo exists (the script will create it if missing).
   - Fill `.env.deploy` with:
     ```
     AWS_ACCOUNT_ID=123456789012
     AWS_REGION=us-east-1
     FRONTEND_BUCKET=my-crossword-frontend
     VITE_API_BASE=https://api.example.com
     IMAGE_TAG=latest
     ECR_REPO=crossword-league
     ```
   - Run `./scripts/deploy.sh`. This will:
     - Build the frontend with `VITE_API_BASE` baked in and upload to S3.
     - Build and push the backend image to ECR.
   - In ECS, update your task definition/service to use the pushed image tag (IMAGE_TAG).

6) **Wire DNS (optional if you have a domain)**
   - Route 53 (or your DNS) A record `www.example.com` -> your CloudFront distribution.
   - Route 53 A record `api.example.com` -> your ALB.
   - If no custom domain: use the CloudFront domain for the frontend and the ALB DNS name (or a CloudFront distribution) for the API; set `VITE_API_BASE` and `ALLOWED_ORIGINS` to those URLs.

7) **CORS + env sanity**
   - API `ALLOWED_ORIGINS` should include your frontend origin (e.g., `https://www.example.com`).
   - Turn off any dev flags (`DISABLE_ADMIN_AUTH`).

8) **Test**
   - Hit `https://api.example.com/health` (should return `{"status": "ok"}`).
   - Open `https://www.example.com` and ensure the app can load data.

If you prefer infrastructure-as-code instead of console clicks, you can translate steps 2–4 into CloudFormation/Terraform later. This guide gets you live with minimal AWS console work plus the provided deploy script.

#### Migrate existing SQLite data to RDS Postgres
1) Create your RDS Postgres instance and note `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`. Allow temporary access from your machine (security groups).
2) Stop the app to avoid writes during migration.
3) Copy data with the helper script (from repo root):
   ```bash
   uv run python scripts/migrate_sqlite_to_pg.py \
     --source sqlite:///./crossword.db \
     --target postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
   ```
   Replace the Postgres URL with your RDS connection string. This preserves IDs for joins and uniques.
4) Point `DATABASE_URL` to RDS in your ECS task/env (and locally if testing) and restart the backend.
5) Verify via `/health` and spot-check data in the app.

#### Common ECS deploy gotchas
- If tasks fail to pull with `descriptor matching platform 'linux/amd64'`, rebuild/push the image for amd64: the deploy script uses `docker build --platform linux/amd64 ...`. Re-run `./scripts/deploy.sh` to push a compatible image.
  - On Apple Silicon, make sure BuildKit/buildx is available; the script uses `docker buildx build --platform linux/amd64 ... --push`. Use a fresh `IMAGE_TAG` when re-pushing so ECS picks up the new manifest.
