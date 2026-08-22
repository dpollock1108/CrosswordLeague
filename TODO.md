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
Entries are already scored, but obscure ones still get through, and a confusing
first puzzle is the fastest way to lose a new player.

**This is not a threshold tweak.** `_MIN_QUALITY_SCORE = 50` in
`puzzle_gen_algo.py` is commented as "highest tier — common, well-known", but 50
is the top of only five bands and contains 119,368 entries, including `ATREE`,
`SETAT`, `ESOS`, `TIETO` and `OTOES`. The score bands are crossword-fill
acceptability, not familiarity.

Tightening the filter alone makes generation *fail*: restricting the list to
words that also appear in a plain English dictionary (6,454 entries) produced
**zero** valid 5x5 grids across 400 attempts. The current templates and solver
depend on crosswordese to close a 5x5.

So the fix is some combination of: a real frequency-ranked word list rather than
the binary cutoff; grid templates with more black squares so entries are shorter
and less constrained; and possibly a tighter bar for Mini than Medium. Worth
deciding what "obscure" means concretely before building anything.

### 15. Self-service account deletion
The privacy policy now promises "ask us to delete your account and we will
remove it and your associated data." Nothing in the codebase does that, so today
it means manual SQL — and it's a commitment in writing, which makes this the
one item with an external obligation attached.

The hard part isn't the delete, it's `puzzle_results`. Those rows feed league
leaderboards, so removing a player silently rewrites history for everyone else
in their league. Decide the policy first: hard-delete results, or anonymise the
player (drop email, handle, avatar, `google_id`; keep the results attached to a
tombstone) so past leaderboards still add up. Anonymising is the usual answer
and is defensible under GDPR, but it is a decision, not a default.

Note `user.player_id` is unique and `puzzle_results.player_id` is `NOT NULL`
with no cascade, so a naive `DELETE FROM "user"` either fails or orphans rows.

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


### 16. Self-host the display font
`styles.css` line 1 pulls Space Grotesk from `fonts.googleapis.com`, so every
visitor's browser contacts Google and reveals its IP address on page load —
before sign-in, and including people who never sign in at all. That's a real
disclosure the privacy policy currently has to make, and a recurring GDPR
complaint against Google Fonts specifically.

Vendoring the woff2 files into the repo and swapping the `@import` for a local
`@font-face` deletes the third-party request entirely, removes that paragraph
from the policy, and drops a render-blocking round trip to another origin.
Cheap fix, three wins.

### 14. README still documents the retired global scoring ladder
The "Scoring" section lists the fixed 1–5 point tiers and the +1 first-place
bonus as if they were global. That's the same claim the `/scoring` page was
deleted for — scoring is per league now, configured via `ScoringConfigEditor`.

## Done

### 17. Scheduled publishing of the next day's puzzles
`POST /api/puzzles/cron/publish-next` publishes tomorrow's mini and medium and
refills the draft buffer. Publishes from a buffer of pre-generated drafts rather
than generating on demand, so a generation outage costs buffer depth instead of
a day's puzzle. Idempotent, and each type is handled independently.

**Still to do:** create the Cloud Scheduler job — the command is in the README
under Deployment / Scheduled publishing. Nothing runs until that exists.

**Known gaps, deliberately left:** the admin token lives in the Scheduler job
config rather than using OIDC; and the endpoint returns 200 with `ok: false` on
partial failure, so Scheduler's retry logic can't see a problem — alerting has
to read the body or the logs.

### 13. `app/list_users.py`
Committed. `uv run python -m app.list_users` lists registered users, reading
`DATABASE_URL` the same way the app does — local SQLite by default, or point it
at production through the Cloud SQL Proxy. Item 4's admin view would still be
the better answer for day-to-day use, since this needs a terminal and database
access.

### 1. Refreshing on /leagues returned "Missing authorization header."
The API and the SPA shared one path namespace, so `GET /leagues` matched the
API router and hit the auth dependency with no header instead of serving the
app. Fixed by mounting every router under `/api` (`API_PREFIX` in
`app/server.py`) and pointing `API_BASE` in `frontend/src/api.ts` at it.
`/health` stays at the root for the CI and Cloud Run probes. An unmatched
`/api/*` path now 404s as JSON rather than returning `index.html`.
