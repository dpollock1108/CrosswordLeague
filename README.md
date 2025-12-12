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

### API overview
- `GET /health` — service status
- `GET /players` — list players
- `POST /players` — create player (admin)
- `POST /results` — bulk upsert puzzle results (admin)
- `POST /results/single` — upsert one puzzle result (admin)
- `GET /leaderboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — leaderboard over a window (defaults to the last 30 days)
- `GET /players/{player_id}/stats` — stats for a single player

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
