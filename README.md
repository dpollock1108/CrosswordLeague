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
    puzzles.py     — Puzzle CRUD, solve flow, AI generation
  migrations/      — Alembic migration files
frontend/src/
  contexts/AuthContext.tsx  — Auth state (Google login, JWT persistence)
  pages/
    ResultsDashboard.tsx    — Leaderboard with week/month navigation
    DailyPuzzle.tsx         — Interactive crossword solver
    PlayerProfile.tsx       — Per-player stats lookup
    Profile.tsx             — Authenticated user's profile + handle editor
    ScoringPage.tsx         — Scoring rules documentation
    NytTracker.tsx          — Legacy NYT Mini import tools (screenshot/CSV/manual)
  components/
    CrosswordGrid.tsx       — Interactive crossword grid component
    ClueList.tsx            — Clue sidebar with active highlighting
```

### Data Model

- **Player** — name, handle, email, nyt_username. Represents a competitor on leaderboards.
- **User** — google_id, email, display_name, handle, avatar_url, player_id (FK → Player). Represents an authenticated account.
- **Puzzle** — puzzle_type (mini_5x5 / medium_10x10), puzzle_date, grid_data (JSON), clues_data (JSON), status (draft/published). One per type per day.
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

**Public:**
- `GET /health` — Service status
- `GET /leaderboard?start_date=&end_date=&puzzle_type=` — Leaderboard
- `GET /players` — List all players
- `GET /players/{id}/stats` — Player statistics
- `GET /wall-of-shame?scope=week|month` — Missing puzzle report

**Auth:**
- `POST /auth/google` — Exchange Google ID token for JWT
- `GET /auth/me` — Current user profile
- `PUT /auth/me` — Update display name and handle

**Puzzles (requires auth):**
- `GET /puzzles/today?type=mini_5x5` — Today's puzzle (answers stripped)
- `GET /puzzles/{id}` — Specific puzzle + solve attempt state
- `POST /puzzles/{id}/start` — Start solve timer
- `POST /puzzles/{id}/save` — Save progress (auto-save every 30s)
- `POST /puzzles/{id}/submit` — Submit for server-side validation

**Admin (requires `X-Admin-Token` header):**
- `POST /players` — Create player
- `PUT /players/{id}` — Update player
- `POST /results` — Bulk upsert results
- `POST /results/single` — Single result upsert
- `POST /results/parse-screenshot` — Parse NYT leaderboard screenshot
- `POST /results/import-csv` — CSV import
- `POST /puzzles` — Create puzzle manually
- `POST /puzzles/generate` — Generate puzzle with AI
- `POST /puzzles/{id}/publish` — Publish a draft puzzle

### Frontend Pages

| Route | Page | Access |
|---|---|---|
| `/` | Global leaderboard | Public |
| `/play` | Daily crossword solver | Authenticated |
| `/players` | Player stats lookup | Public |
| `/profile` | Your profile + handle editor | Authenticated |
| `/scoring` | Scoring rules | Public |
| `/leagues` | League list + create/join | Authenticated |
| `/leagues/:id` | League leaderboard + members | Member |
| `/builder` | Puzzle builder (manual + AI) | Admin only |
| `/nyt-tracker` | Legacy NYT Mini import tools | Admin only |

### Crossword Solver

The `/play` page features an interactive crossword grid:
- **Mini (5×5)** and **Medium (10×10)** puzzle tabs
- Click to select cells, click again to toggle across/down
- Type to fill, arrow keys to navigate, Tab to cycle clues
- Current word highlighting + clue sidebar sync
- Server-side timer (anti-cheat) — solution never sent to client
- Auto-save every 30 seconds for resume support
- On completion, a `PuzzleResult` is created automatically for scoring

### Deployment

The Dockerfile builds both frontend and backend into a single image. Alembic migrations run on startup.

```bash
docker build -t crossword-league .
```

**Required env vars for production:**
- `DATABASE_URL` (PostgreSQL connection string)
- `ADMIN_TOKEN`
- `GOOGLE_CLIENT_ID`
- `JWT_SECRET` (generate a strong random value)
- `ANTHROPIC_API_KEY`
- `ALLOWED_ORIGINS` (your frontend domain)

Deploy scripts exist for both AWS (`scripts/deploy.sh`) and GCP Cloud Run (`scripts/deploy-gcp.sh`).

### Seed Data

```bash
uv run python -m app.seed
```

Adds sample players and ~3 weeks of daily results into the configured database.
