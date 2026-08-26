## Crossword League

A crossword puzzle platform where users solve daily puzzles, compete on leaderboards, and track stats. Includes Google SSO, AI-generated crosswords, and a time-based scoring system.

### Stack

- **Backend**: Python 3.9+ / FastAPI / SQLModel / Alembic migrations
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: SQLite (dev) or PostgreSQL (prod)
- **Auth**: Google Sign-In (OAuth2 ID tokens) + JWT sessions
- **Puzzle generation**: Claude API (Anthropic SDK)
- **Package management**: `uv` (Python), `npm` (frontend)

### Quickstart

```bash
# Install dependencies
uv sync
cd frontend && npm install && cd ..

# Run the backend (port 8001)
uv run python main.py

# Run the frontend (port 5173, separate terminal)
cd frontend && npm run dev
```

### Configuration

Create a `.env` in the project root:

```
DATABASE_URL=sqlite:///./crossword.db
ADMIN_TOKEN=your-admin-token
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
JWT_SECRET=your-random-secret
ANTHROPIC_API_KEY=your-anthropic-key
ALLOWED_ORIGINS=http://localhost:5173
```

Create `frontend/.env`:

```
VITE_API_BASE=http://localhost:8001
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

**All backend env vars:**

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./crossword.db` | Database connection string |
| `ADMIN_TOKEN` | `changeme` | Token for admin API endpoints (`X-Admin-Token` header) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth 2.0 Client ID |
| `JWT_SECRET` | `dev-secret-change-me` | Secret for signing JWT tokens |
| `JWT_EXPIRY_HOURS` | `168` (7 days) | JWT token lifetime |
| `ANTHROPIC_API_KEY` | — | For AI puzzle generation and NYT screenshot parsing |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model for clue generation |
| `ANTHROPIC_VISION_MODEL` | `claude-sonnet-4-6` | Model for screenshot parsing (must be multimodal) |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins (comma-separated) |
| `DISABLE_ADMIN_AUTH` | `false` | Skip admin auth checks (dev only) |

### Google OAuth Setup

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized JavaScript origins: `http://localhost:5173` (dev) and your production domain
4. No redirect URIs needed (uses Google Identity Services popup flow)
5. Set the Client ID in both `.env` files

### Database Migrations

Uses Alembic for schema migrations. Migrations run automatically on startup in Docker, or manually:

```bash
uv run alembic upgrade head        # Apply all migrations
uv run alembic revision --autogenerate -m "description"  # Generate new migration
```

### Tests

```bash
uv run pytest
```

### Project Structure

```
app/
  auth.py          — Google token verification, JWT, FastAPI auth dependencies
  config.py        — Settings from environment variables
  database.py      — SQLModel engine and session
  models.py        — Player, User, PuzzleResult, Puzzle, SolveAttempt
  schemas.py       — Pydantic request/response models
  scoring.py       — Time-based scoring logic
  services.py      — Business logic (leaderboard, stats, delinquency)
  puzzle_gen.py    — Puzzle generator protocol + validation
  puzzle_gen_ai.py — Claude-based crossword generator
  vision.py        — NYT screenshot parsing via Claude Vision
  routers/
    auth.py        — POST /auth/google, GET/PUT /auth/me
    players.py     — Player CRUD + stats
    results.py     — Puzzle result submission (bulk, single, CSV, screenshot)
    leaderboard.py — Leaderboard + wall of shame
    admin.py       — Read-only admin views over the whole install
    puzzles.py     — Puzzle CRUD, solve flow, AI generation
  migrations/      — Alembic migration files
frontend/src/
  contexts/AuthContext.tsx  — Auth state (Google login, JWT persistence)
  pages/
    Landing.tsx             — Signed-out explainer + sign-in
    Leagues.tsx             — League list + create/join (home)
    LeagueDetail.tsx        — League leaderboard, members, admin controls
    DailyPuzzle.tsx         — Interactive crossword solver
    Profile.tsx             — Authenticated user's profile + handle editor
    AdminUsers.tsx          — Registered users + their linked Player (admin only)
    Privacy.tsx             — Privacy policy (public, no sign-in required)
    NytTracker.tsx          — Legacy NYT Mini import tools (screenshot/CSV/manual)
  components/
    CrosswordGrid.tsx       — Interactive crossword grid component (fluid width)
    ClueList.tsx            — Clue sidebar with active highlighting
    MobileKeyboard.tsx      — On-screen keyboard for touch devices
    ScoringConfigEditor.tsx — Per-league scoring tiers (league admins)
  hooks/
    useIsTouch.ts           — "no hover, coarse pointer" media query
```

### Data Model

- **Player** — name, handle, email, nyt_username. Represents a competitor on leaderboards.
- **User** — google_id, email, display_name, handle, avatar_url, player_id (FK → Player). Represents an authenticated account.
- **Puzzle** — puzzle_type (mini_5x5 / medium_9x9; legacy medium_10x10), grid_data (JSON), clues_data (JSON), status. Lives in a repository with a **nullable** `puzzle_date`: null = unassigned, set = scheduled live on that date (unique per type/date).
- **SolveAttempt** — user_id, puzzle_id, started_at, completed_at, seconds, grid_state (JSON for resume). One per user per puzzle.
- **PuzzleResult** — player_id, puzzle_date, puzzle_type, seconds, source. Feeds into scoring. Unique on (player_id, puzzle_date, puzzle_type).

### Scoring

For each puzzle date, per puzzle type:

| Finish time | Base points |
|---|---|
| Any finish | 1 |
| < 120s | 2 |
| < 90s | 3 |
| < 60s | 4 |
| ≤ 30s | 5 |

First place (ties included) gets **+1 bonus point**. If `points_override` is set on a result, that value is used instead.

Leaderboard totals sum points across the requested date range, sorted by total points then average time.

### API Overview

All API routes are namespaced under `/api`, so they can never shadow a
client-side route. Before this, the API's `/leagues` shadowed the SPA's
`/leagues`, and refreshing that page returned an auth error instead of the
app. `/health` deliberately stays at the root — CI and Cloud Run probe it.

**Public:**
- `GET /health` — Service status
- `GET /api/leaderboard?start_date=&end_date=&puzzle_type=` — Leaderboard
- `GET /api/players` — List all players
- `GET /api/players/{id}/stats` — Player statistics
- `GET /api/wall-of-shame?scope=week|month` — Missing puzzle report

**Auth:**
- `POST /api/auth/google` — Exchange Google ID token for JWT
- `GET /api/auth/me` — Current user profile
- `PUT /api/auth/me` — Update display name and handle

**Puzzles (requires auth):**
- `GET /api/puzzles/today?type=mini_5x5` — Today's puzzle (answers stripped)
- `GET /api/puzzles/archive?type=mini_5x5` — This week's playable puzzles (catch-up) + your all-time completed
- `GET /api/puzzles/{id}` — Specific puzzle + solve attempt state
- `POST /api/puzzles/{id}/start` — Start solve timer
- `POST /api/puzzles/{id}/save` — Save progress (auto-save every 30s)
- `POST /api/puzzles/{id}/submit` — Submit for server-side validation

**Admin (requires `X-Admin-Token` header, or a JWT for a user with `is_admin`):**
- `GET /api/admin/users` — Every registered user with their linked Player, solve count and league count
- `POST /api/players` — Create player
- `PUT /api/players/{id}` — Update player
- `POST /api/results` — Bulk upsert results
- `POST /api/results/single` — Single result upsert
- `POST /api/results/parse-screenshot` — Parse NYT leaderboard screenshot
- `POST /api/results/import-csv` — CSV import
- `POST /api/puzzles` — Create puzzle manually
- `POST /api/puzzles/generate` — Generate puzzle with AI
- `POST /api/puzzles/{id}/assign` — Assign a repository puzzle to a date (goes live that day)
- `POST /api/puzzles/{id}/unassign` — Return a puzzle to the repository (clears its date)
- `POST /api/puzzles/cron/publish-next` — Publish tomorrow's puzzles and refill the draft buffer (see Scheduled publishing)

### Frontend Pages

| Route | Page | Access |
|---|---|---|
| `/` (signed out) | Landing / sign-in | Public |
| `/` (signed in) | Redirects to `/leagues` | Authenticated |
| `/leagues` | League list + create/join (home) | Authenticated |
| `/leagues/:id` | League leaderboard + members | Member |
| `/play` | Daily crossword solver | Authenticated |
| `/profile` | Your profile + handle editor | Authenticated |
| `/privacy` | Privacy policy | Public |
| `/admin/users` | Registered users + linked Players | Admin only |
| `/scoring` | Retired — scoring is per league now; redirects to `/leagues` | Authenticated |
| `/builder` | Puzzle builder (manual + AI) | Admin only |
| `/nyt-tracker` | Legacy NYT Mini import tools | Admin only |

### Crossword Solver

The `/play` page features an interactive crossword grid:
- **Mini (5×5)** and **Medium (9×9)** puzzle tabs
- Click to select cells, click again to toggle across/down
- Type to fill, arrow keys to navigate, Tab to cycle clues
- Current word highlighting + clue sidebar sync
- Server-side timer (anti-cheat) — solution never sent to client
- Auto-save every 30 seconds for resume support
- On completion, a `PuzzleResult` is created automatically for scoring

On phones and tablets (`hover: none` + `pointer: coarse`) the page switches to a
touch layout: the grid becomes fluid so a 9×9 fits a 360px screen, and the
current clue plus an on-screen keyboard dock to the bottom of the viewport. The
grid is a `div` rather than an `input`, so tapping it can never raise the native
keyboard — `MobileKeyboard` is what makes the puzzle playable on a phone.

### Deployment

Target is **Google Cloud Run**, with Cloud SQL (Postgres) and Secret Manager. The
Dockerfile builds the frontend and backend into a single image, so the API and
the SPA are served from one origin.

#### One-time setup

```bash
GCP_PROJECT=your-project GITHUB_REPO=dpollock1108/CrosswordLeague ./scripts/setup-github-deploy.sh
```

This enables the APIs, creates the Artifact Registry repo, creates a deploy
service account, wires up Workload Identity Federation so GitHub Actions can
authenticate without a long-lived key, and creates the Secret Manager secrets.
It is idempotent and prints the GitHub secrets/variables to add at the end.

You must also create the Cloud SQL instance yourself (see the header comment in
`scripts/deploy-gcp.sh`) and add your production URL to the Google OAuth client's
**Authorized JavaScript origins**, or sign-in will fail.

#### Continuous deployment

`.github/workflows/deploy.yml` runs on every push and PR:

1. **test** — `pytest`, `tsc --noEmit`, and `vite build`.
2. **deploy** — only on `main`, only after tests pass. Builds the image tagged
   with the commit SHA, pushes it, and deploys to Cloud Run.

Because images are tagged by SHA, rolling back is redeploying an older tag
rather than rebuilding. `workflow_dispatch` re-deploys current `main` by hand.

`scripts/deploy-gcp.sh` does the same thing from your laptop and sets the same
env vars and secrets, so a manual deploy will not clobber the service config.

#### Configuration

Secrets live in Secret Manager and are referenced by name — none of them pass
through GitHub:

| Secret | Notes |
| --- | --- |
| `DATABASE_URL` | Full Postgres URL including the password |
| `JWT_SECRET` | Session signing key. The app's default is `dev-secret-change-me`; with that in place anyone can forge a session for any account |
| `ADMIN_TOKEN` | Legacy admin auth |
| `ANTHROPIC_API_KEY` | Clue generation and screenshot parsing |

Non-secret settings are Cloud Run env vars, from GitHub Actions **variables**:
`GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS` (defaults to `*` if unset — set it to your
real domain), and `DISABLE_ADMIN_AUTH`, which the deploy pins to `false`.

`VITE_API_BASE` and `VITE_GOOGLE_CLIENT_ID` are inlined by Vite at **build**
time, so they are `--build-arg`s rather than runtime env vars. `VITE_API_BASE`
is deliberately empty in production so the SPA talks to its own origin.

#### Migrations

The container runs `alembic upgrade head` on startup, so migrations apply
automatically on deploy. Two things follow from that:

- A failed migration fails the new revision's startup, and Cloud Run keeps
  serving the previous revision. A *successful but wrong* migration reaches
  production with no gate.
- Every cold-started instance runs it, so a scale-up can run migrations
  concurrently. Alembic takes no lock by default. Deploy schema changes when
  traffic is low, or move migrations to a dedicated pre-deploy step.

#### Scheduled publishing

`POST /api/puzzles/cron/publish-next` publishes the next day's mini and medium
and then refills the repository buffer. `min-instances=0` means nothing
in-process can run a timer, so it is driven externally by Cloud Scheduler.

**It publishes from a buffer rather than generating on demand.** Generating
tomorrow's puzzle at the moment it is needed makes every day depend on an AI
call and a CSP solve both succeeding in the next few seconds. Instead the job
assigns the oldest unassigned draft, then generates to top the buffer back up
(`BUFFER_TARGET = 3` in `app/puzzle_scheduler.py`). A generation outage costs
buffer depth, and there are several days of warning before it costs a player a
puzzle.

Each step commits separately, so even a run killed halfway leaves tomorrow's
puzzle published — only the top-up is lost.

Create the job (once):

```bash
gcloud scheduler jobs create http publish-next-puzzles \
  --project=crosswordleague \
  --location=us-central1 \
  --schedule="0 12 * * *" \
  --time-zone=UTC \
  --uri="https://crosswordboys.com/api/puzzles/cron/publish-next" \
  --http-method=POST \
  --attempt-deadline=540s \
  --headers="X-Admin-Token=$(gcloud secrets versions access latest --secret=ADMIN_TOKEN --project=crosswordleague)"
```

`0 12 * * *` UTC is 12 hours before the 00:00 UTC rollover that makes a puzzle
"today's" (`date.today()` in the container is UTC). **If the rollover timezone
ever changes, this cron expression and `next_puzzle_date()` have to move
together.**

Two caveats worth knowing:

- The admin token ends up stored in the Scheduler job config, readable by anyone
  with console access. An OIDC token against a dedicated endpoint would avoid
  that standing credential.
- Scheduler only sees the HTTP status. The endpoint returns 200 with `ok: false`
  when a type ends up with no puzzle, so a failure looks like success to
  Scheduler's retry logic. Alerting has to read the response body — or the log
  line the job writes — not the status code.

Safe to run by hand, and safe to run twice; a type that already has a puzzle for
the target date is left alone:

```bash
curl -X POST https://crosswordboys.com/api/puzzles/cron/publish-next \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

### Seed Data

```bash
uv run python -m app.seed
```

Adds sample players and ~3 weeks of daily results into the configured database.
