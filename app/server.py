from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import auth, leaderboard, leagues, players, puzzles, results
from .schemas import HealthResponse

# Mount point for every API route. The SPA owns every other path.
API_PREFIX = "/api"


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="Crossword League", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Stays at the root, outside API_PREFIX: the CI boot check and Cloud Run
    # both probe /health, and no client-side route claims that path.
    @app.get("/health", response_model=HealthResponse)
    def healthcheck() -> HealthResponse:
        return HealthResponse(status="ok")

    # Everything the API serves lives under /api, so it can never collide with a
    # client-side route. It used to share the namespace with the SPA: the API's
    # /leagues shadowed the app's /leagues, so refreshing the page a signed-in
    # user lands on matched the API route, hit the auth dependency with no
    # header, and answered "Missing authorization header." instead of serving
    # the app. Deep links only worked if you navigated from the root.
    api = APIRouter(prefix=API_PREFIX)
    api.include_router(auth.router)
    api.include_router(players.router)
    api.include_router(results.router)
    api.include_router(leaderboard.router)
    api.include_router(puzzles.router)
    api.include_router(leagues.router)
    app.include_router(api)

    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_spa(full_path: str) -> FileResponse:
            # An unmatched /api path is a bug in a caller, not a deep link.
            # Returning index.html there would answer a bad API call with HTML
            # and surface as an unrelated JSON parse error at the fetch site.
            if f"/{full_path}".startswith(f"{API_PREFIX}/"):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
            index = frontend_dist / "index.html"
            return FileResponse(str(index))

    return app


app = create_app()
