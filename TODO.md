# TODO

Running backlog. Roughly ordered by "what hurts users first."

## Bugs

### 2. Picking a handle held by a legacy player returns a 500
`update_profile` checks `User.handle` for uniqueness, then writes the handle to
the linked `Player` row, which has its own unique index (`ix_player_handle`).
Unhandled `IntegrityError` at `app/routers/auth.py:114`.

Fix: check `Player.handle` too, catch `IntegrityError`, return the existing 409.

### 3. New signups don't link to their legacy player
`google_login` links to an existing `Player` by **email** only, so anyone with
NYT-tracker history under a different email gets a fresh empty player — and then
hits bug #2 when they pick their own nickname. Currently needs manual SQL per
person.

Fix: also match by handle at signup, or offer a claim flow.

## Features

### 4. Admin view of registered users
Admin-gated `GET` plus a page, using the existing `require_admin_or_token`
dependency (`app/auth.py:127`) and the `user?.is_admin` nav block in `App.tsx`.

Show email, handle, joined, last seen, **linked `player.id` and that player's
result count** — the player-link column is what makes bugs #2 and #3 visible at
a glance. Supersedes most of `app/list_users.py`.

### 5. Filter obscure words out of generated puzzles
Entries are already scored for ease of guess, but obscure ones still get
through, and a confusing first puzzle is the fastest way to lose a new player.

Not yet investigated. Starting points: `app/puzzle_gen.py`,
`puzzle_gen_algo.py`, `puzzle_gen_ai.py`. Questions to answer first — where does
the word list come from, what is the current ease score and its threshold, and
is the fix a stricter cutoff, a better-curated source, or a frequency-based
filter? Consider a tighter threshold for Mini than Medium.

## Delivery pipeline

### 6. Branch protection on `main`
Nothing currently enforces the PR habit. Require the `Tests` and
`Postgres startup` checks; skip required approvals (solo).

### 7. Move migrations out of the container CMD — highest value here
`Dockerfile` runs `alembic upgrade head` at container start. That means
concurrent instances race with no advisory lock, a bad migration crash-loops
instead of failing the deploy, and **a Cloud Run rollback restores the code but
not the schema**.

Fix: run migrations as a deploy step before `gcloud run deploy`, via the Cloud
SQL Proxy. Then adopt expand/contract so each migration stays compatible with
the previously deployed code for one release.

### 8. Deploy with `--no-traffic`, smoke test, then shift
Currently 100% of traffic moves the instant the revision is healthy. Deploy
tagged with no traffic, probe it, then `update-traffic --to-latest`.

Rollback: `gcloud run services update-traffic crossword-league
--region us-central1 --to-revisions REVISION=100`

### 9. Staging environment — deliberately deferred
Second Cloud Run service + second database on the existing instance. Not worth
the cost and drift until there are users who'd notice. Items 7 and 8 cover most
of the risk.

## Testing gaps

### 10. No frontend tests at all
Vitest drops into the existing Vite setup. Highest value first: the pure logic
in `nextSelection`, `getWordCells`, `computeCellNumbers`, `findClueForCell` —
fiddly, easy to break silently, no dependencies.

### 11. `/play` can't be tested without Google sign-in
A dev-only seeded login (same shape as `DISABLE_ADMIN_AUTH`, equally pinned off
in the deploy) would make the solver testable locally.

## Housekeeping

### 12. Node 20 deprecation warnings in CI
`actions/checkout@v4`, `actions/setup-node@v4`, `astral-sh/setup-uv@v5`.

### 13. Commit or drop `app/list_users.py`
Currently uncommitted. Item 4 largely replaces it.

### 14. README still documents the retired global scoring ladder
The "Scoring" section lists the fixed 1–5 point tiers and the +1 first-place
bonus as if they were global. That's the same claim the `/scoring` page was
deleted for — scoring is per league now, configured via `ScoringConfigEditor`.

## Done

### 1. Refreshing on /leagues returned "Missing authorization header."
The API and the SPA shared one path namespace, so `GET /leagues` matched the
API router and hit the auth dependency with no header instead of serving the
app. Fixed by mounting every router under `/api` (`API_PREFIX` in
`app/server.py`) and pointing `API_BASE` in `frontend/src/api.ts` at it.
`/health` stays at the root for the CI and Cloud Run probes. An unmatched
`/api/*` path now 404s as JSON rather than returning `index.html`.
