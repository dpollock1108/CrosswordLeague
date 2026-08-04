## Crossword League

A crossword puzzle platform where users solve daily puzzles, compete on leaderboards, and track stats. Includes Google SSO, AI-generated crosswords, and a time-based scoring system.

It also hosts **QOTD** — question of the day — a Wordle-shaped trivia game sharing the same accounts, leagues, and weekly rhythm: one question a day per track (general knowledge, math, …), one shot at each, scored on correctness and speed. See [QOTD](#qotd--question-of-the-day).

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
  models.py        — Player, User, PuzzleResult, Puzzle, SolveAttempt, Friendship,
                     TriviaQuestion, TriviaAnswer
  schemas.py       — Pydantic request/response models
  scoring.py       — Time-based scoring logic
  services.py      — Business logic (leaderboard, stats, delinquency)
  puzzle_gen.py    — Puzzle generator protocol + validation
  puzzle_gen_ai.py — Claude-based crossword generator
  vision.py        — NYT screenshot parsing via Claude Vision
  friend_service.py — Mutual friend graph (requests, accept/decline, friend ids)
  qotd_service.py  — QOTD submissions, scheduling, play loop, boards
  qotd_scoring.py  — QOTD points (correctness + per-track speed tiers + streaks)
  qotd_tracks.py   — Track registry: add a new daily question type here
  qotd_verify.py   — AI fact-check gate for submitted questions
  qotd_schemas.py  — QOTD request/response models
  qotd_seed.py     — Starter question bank
  routers/
    auth.py        — POST /auth/google, GET/PUT /auth/me
    players.py     — Player CRUD + stats
    results.py     — Puzzle result submission (bulk, single, CSV, screenshot)
    leaderboard.py — Leaderboard + wall of shame
    puzzles.py     — Puzzle CRUD, solve flow, AI generation
    friends.py     — Friend requests and friend list
    qotd.py        — QOTD play loop, boards, submissions, admin review
  migrations/      — Alembic migration files
frontend/src/
  contexts/AuthContext.tsx  — Auth state (Google login, JWT persistence)
  pages/
    Landing.tsx             — Signed-out explainer + sign-in
    Leagues.tsx             — League list + create/join (home)
    LeagueDetail.tsx        — League leaderboard, members, admin controls
    DailyPuzzle.tsx         — Interactive crossword solver
    Profile.tsx             — Authenticated user's profile + handle editor
    ScoringPage.tsx         — Scoring rules documentation
    NytTracker.tsx          — Legacy NYT Mini import tools (screenshot/CSV/manual)
    Qotd.tsx                — Question of the day: play + standings
    QotdSubmit.tsx          — Submit a question + your submissions' verification status
    QotdAdmin.tsx           — QOTD review queue and scheduling (admin)
    Friends.tsx             — Add and manage friends
  components/
    CrosswordGrid.tsx       — Interactive crossword grid component
    ClueList.tsx            — Clue sidebar with active highlighting
    QotdBoard.tsx           — Today's QOTD results + weekly table (friends or league)
```

### Data Model

- **Player** — name, handle, email, nyt_username. Represents a competitor on leaderboards.
- **User** — google_id, email, display_name, handle, avatar_url, player_id (FK → Player). Represents an authenticated account.
- **Puzzle** — puzzle_type (mini_5x5 / medium_9x9; legacy medium_10x10), grid_data (JSON), clues_data (JSON), status. Lives in a repository with a **nullable** `puzzle_date`: null = unassigned, set = scheduled live on that date (unique per type/date).
- **SolveAttempt** — user_id, puzzle_id, started_at, completed_at, seconds, grid_state (JSON for resume). One per user per puzzle.
- **PuzzleResult** — player_id, puzzle_date, puzzle_type, seconds, source. Feeds into scoring. Unique on (player_id, puzzle_date, puzzle_type).
- **Friendship** — requester_id, addressee_id, status (pending / accepted). One row per pair, in whichever direction the request went; reads match on both columns.
- **TriviaQuestion** — track, prompt, choices_data (JSON), answer_index, submitted_by, status, nullable `question_date` (null = in the bank, set = live that day), plus the AI verdict fields. One live question per (track, date).
- **TriviaAnswer** — user_id, question_id, track, started_at, answered_at, seconds, selected_index, is_correct, points. One per user per question, so a player can answer every track each day.

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
- `GET /puzzles/archive?type=mini_5x5` — This week's playable puzzles (catch-up) + your all-time completed
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
- `POST /puzzles/{id}/assign` — Assign a repository puzzle to a date (goes live that day)
- `POST /puzzles/{id}/unassign` — Return a puzzle to the repository (clears its date)

### Frontend Pages

| Route | Page | Access |
|---|---|---|
| `/` (signed out) | Landing / sign-in | Public |
| `/` (signed in) | Redirects to `/leagues` | Authenticated |
| `/leagues` | League list + create/join (home) | Authenticated |
| `/qotd` | Question of the day: play + standings | Authenticated |
| `/qotd/submit` | Submit a question, track verification | Authenticated |
| `/friends` | Add and manage friends | Authenticated |
| `/qotd-admin` | QOTD review queue + scheduling | Admin only |
| `/leagues/:id` | League leaderboard + members | Member |
| `/play` | Daily crossword solver | Authenticated |
| `/profile` | Your profile + handle editor | Authenticated |
| `/scoring` | Scoring rules | Authenticated |
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

### QOTD — Question of the Day

One multiple-choice question goes live per day **per track**. You get a single attempt, timed
server-side from the moment you reveal the question, and you're ranked on whether you got it
right and how fast. Friends' and league-mates' results stay hidden until you've answered, so
the board can't leak the answer.

**Tracks.** A track is an independent daily stream — its own question each day, its own bank,
board, streak, and speed tiers. Two ship today:

| Track | Top speed tier | Clamp | For |
|---|---|---|---|
| `general` | ≤ 10s | 120s | General knowledge recall |
| `math` | ≤ 30s | 600s | Problems you have to work out |

Tracks are fully independent: answering the math question doesn't touch your general streak,
each track awards its own fastest-of-the-day bonus, and a track with an empty bank simply has no
question that day rather than borrowing from another.

**Adding a track** is a one-entry change in `app/qotd_tracks.py` — register a `Track` with its
slug, speed tiers, and clamp, and it appears in the play tabs, submission form, admin filters,
and boards automatically. Nothing else needs to know about it. A slug is stored on every
question and answer, so it must not change once questions exist under it. Give a new track its
own tier table rather than reusing another's: the tiers encode how long that kind of question
should take.

**Where questions come from.** Every question is written by a player. A submission is
fact-checked by Claude before it can be scheduled — the verifier works out the answer
independently and checks that no other choice is defensible, that the question is unambiguous
and stable over time, and that it's clean and self-contained. The policy is deliberately
conservative:

| Verifier outcome | Question status |
|---|---|
| Confident (≥ 85) and independently picks the submitted answer | `approved` — enters the bank |
| Picks a different answer than the submitter marked | `rejected` |
| Confident (≥ 80) rejection | `rejected` |
| Anything less certain, or a verifier error / missing API key | `needs_review` — waits for an admin |

Admins can override either way from `/qotd-admin`, or re-run the fact-check. Only `approved`
questions can be scheduled onto a date, and only one question exists per date. If a day has
nothing scheduled, the oldest verified question in the bank is promoted automatically, so the
game keeps running without a daily admin action.

**Scoring.** A wrong answer scores nothing however fast it was.

| | Points |
|---|---|
| Correct answer (base) | 2 |
| Speed tier (per track, see above) | +5 / +4 / +3 / +2 / +1 |
| Streak of 3 / 7 / 14 / 30 correct days on that track | +1 / +2 / +3 / +4 |
| Fastest correct answer of the day, per track (ties included) | +1 |

Base, speed, and streak are personal and stored on the answer as soon as you play. The daily
speed bonus is scope-relative — the fastest among your friends isn't the fastest in your league —
so it's applied when a board is built, mirroring the crossword leaderboard. Answers slower than
the track's clamp are capped. Weekly boards run Sun–Sat, the same week the crossword league uses,
and combine every track by default with per-track filtering available.

**Social.** Two overlapping scopes, both available on the standings panel:

- **Friends** — mutual, added by handle. If two people request each other, the second request
  just accepts the first.
- **Leagues** — the existing crossword leagues double as QOTD groups; each league page carries a
  QOTD board for its members.

**QOTD API (requires auth):**
- `GET /qotd/tracks` — Every track, its speed tiers, and your status/streak on it today
- `GET /qotd/today?track=` — That track's question; the answer key is withheld until you've answered
- `POST /qotd/{id}/start` — Reveal the question and start the server-side clock (idempotent)
- `POST /qotd/{id}/answer` — Submit your one answer; returns correctness, time, points, streak
- `GET /qotd/board?scope=friends|league&league_id=&track=` — Today's results for that scope and track
- `GET /qotd/leaderboard?scope=&league_id=&start_date=&end_date=&track=` — Points table (defaults to this week; omit `track` to combine all)
- `GET /qotd/stats` — Your played / correct / accuracy / streaks / points, with a per-track breakdown
- `POST /qotd/questions` — Submit a question (runs the fact-checker)
- `GET /qotd/questions/mine` — Your submissions and their verification notes

**QOTD admin:**
- `GET /qotd/admin/questions?status=&track=` — Review queue / bank / scheduled / rejected
- `POST /qotd/admin/questions/{id}/review` — Override the AI verdict
- `POST /qotd/admin/questions/{id}/reverify` — Re-run the fact-checker
- `POST /qotd/admin/questions/{id}/schedule` — Put a verified question on a date
- `POST /qotd/admin/questions/{id}/unschedule` — Return it to the bank (only before it goes live)
- `DELETE /qotd/admin/questions/{id}` — Delete a question that has never been live

**Friends API (requires auth):**
- `GET /friends` — Friends plus pending requests in both directions
- `POST /friends/requests` — Send a request by handle
- `POST /friends/requests/{user_id}/accept` · `/decline` — Respond to a request
- `DELETE /friends/requests/{user_id}` — Withdraw a request you sent
- `DELETE /friends/{user_id}` — Unfriend

Without `ANTHROPIC_API_KEY` set, the verifier degrades to `needs_review` rather than failing, so
submissions still work in local dev — they just all queue for a human.

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
uv run python -m app.seed       # sample players + ~3 weeks of crossword results
uv run python -m app.qotd_seed  # starter QOTD question bank
```

`app.seed` adds sample players and ~3 weeks of daily results. `app.qotd_seed` inserts
hand-written questions for every track as pre-approved bank entries so QOTD has something to
serve on day one; they're marked as seeded in their verification notes to distinguish them from
AI-verified player submissions.
