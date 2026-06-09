from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import auth, leaderboard, leagues, players, puzzles, results
from .schemas import HealthResponse


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

    @app.get("/health", response_model=HealthResponse)
    def healthcheck() -> HealthResponse:
        return HealthResponse(status="ok")

    app.include_router(auth.router)
    app.include_router(players.router)
    app.include_router(results.router)
    app.include_router(leaderboard.router)
    app.include_router(puzzles.router)
    app.include_router(leagues.router)

    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_spa(full_path: str) -> FileResponse:
            index = frontend_dist / "index.html"
            return FileResponse(str(index))

    return app


app = create_app()
