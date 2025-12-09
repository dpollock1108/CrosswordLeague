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
- **Player** — name, optional handle/email, created_at
- **PuzzleResult** — player_id, puzzle_date, seconds, optional points_override/note/source

Each `(player_id, puzzle_date)` pair is unique. Results are grouped per date; points are assigned by rank using the configured points table unless `points_override` is provided.

### Scoring
For each puzzle date:
- Results are sorted by `seconds` (ties share the same rank).
- Points come from `POINTS_TABLE` for that rank; additional players receive 1 point.
- If `points_override` is set for a result, that value is used instead.
Leaderboard totals sum points across the requested date range and include average/best times.

### Next steps
- Hook up a JS frontend (e.g., Vite/React) that consumes `/leaderboard` and `/players/{id}/stats`.
- Add authentication/UI for the admin panel to manage players and bulk imports.
- Add unit tests for the scoring rules and stats aggregation.

### Frontend sketch
- Use Vite + React + TypeScript with a small client for the FastAPI endpoints (set `VITE_API_BASE` in `.env`).
- Pages: public leaderboard, player detail (times + stats), and a lightweight admin upload form for bulk results.
- Reuse `POINTS_TABLE` from the API when rendering the leaderboard to keep scoring consistent.
