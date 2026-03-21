from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import get_session, init_db
from .schemas import (
    BulkPuzzleResultCreate,
    CSVImportSummary,
    DelinquentPlayer,
    HealthResponse,
    LeaderboardResponse,
    ParsedLeaderboardEntry,
    PlayerCreate,
    PlayerPublic,
    PlayerStats,
    PuzzleResultCreate,
    PuzzleResultPublic,
    ScreenshotParseResponse,
    WallOfShameResponse,
)
from .services import (
    build_player_stats,
    calculate_leaderboard,
    create_player,
    default_date_window,
    find_delinquent_players,
    import_results_from_rows,
    list_players,
    update_player,
    store_results,
    list_results_by_date,
    upsert_puzzle_result,
)


def require_admin(x_admin_token: Optional[str] = Header(None)) -> None:
    if settings.disable_admin_auth:
        return
    if not settings.admin_token_configured:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Set ADMIN_TOKEN before performing admin actions.",
        )
    if x_admin_token != settings.admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token.",
        )


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

    @app.get("/players", response_model=List[PlayerPublic])
    def get_players(session=Depends(get_session)) -> List[PlayerPublic]:
        return [PlayerPublic.model_validate(player) for player in list_players(session)]

    @app.post("/players", response_model=PlayerPublic, status_code=status.HTTP_201_CREATED)
    def post_player(
        payload: PlayerCreate,
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> PlayerPublic:
        player = create_player(session, payload)
        return PlayerPublic.model_validate(player)

    @app.put("/players/{player_id}", response_model=PlayerPublic)
    def put_player(
        player_id: int,
        payload: PlayerCreate,
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> PlayerPublic:
        player = update_player(session, player_id, payload)
        if not player:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")
        return PlayerPublic.model_validate(player)

    @app.post("/results", response_model=List[PuzzleResultPublic])
    def post_results(
        payload: BulkPuzzleResultCreate,
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> List[PuzzleResultPublic]:
        results = store_results(session, payload)
        return [PuzzleResultPublic.model_validate(result) for result in results]

    @app.post("/results/import-csv", response_model=CSVImportSummary)
    def post_results_csv(
        rows: List[dict],
        overwrite_existing: bool = Query(True, description="Overwrite existing results when true"),
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> CSVImportSummary:
        return import_results_from_rows(session, rows=rows, overwrite_existing=overwrite_existing)

    @app.post("/results/single", response_model=PuzzleResultPublic, status_code=status.HTTP_201_CREATED)
    def post_single_result(
        payload: PuzzleResultCreate,
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> PuzzleResultPublic:
        record = upsert_puzzle_result(session, payload, overwrite_existing=True)
        session.commit()
        session.refresh(record)
        return PuzzleResultPublic.model_validate(record)

    @app.post("/results/parse-screenshot", response_model=ScreenshotParseResponse)
    async def parse_screenshot(
        image: UploadFile = File(..., description="Leaderboard screenshot (JPEG or PNG)"),
        puzzle_date: date = Form(..., description="Puzzle date (YYYY-MM-DD)"),
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> ScreenshotParseResponse:
        if not settings.anthropic_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ANTHROPIC_API_KEY is not configured.",
            )

        image_bytes = await image.read()
        media_type = image.content_type or "image/jpeg"

        from .vision import parse_leaderboard_image

        try:
            raw_entries = parse_leaderboard_image(image_bytes, media_type)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Image parsing failed: {exc}",
            )

        players = list_players(session)
        nyt_lookup = {p.nyt_username.lower(): p for p in players if p.nyt_username}

        parsed: list[ParsedLeaderboardEntry] = []
        for entry in raw_entries:
            username: str = entry.get("username", "")
            player = nyt_lookup.get(username.lower())
            parsed.append(
                ParsedLeaderboardEntry(
                    nyt_username=username,
                    time_str=entry.get("time", ""),
                    seconds=int(entry.get("seconds", 0)),
                    player_id=player.id if player else None,
                    player_name=player.name if player else None,
                    matched=player is not None,
                )
            )

        matched_count = sum(1 for e in parsed if e.matched)
        return ScreenshotParseResponse(
            puzzle_date=puzzle_date,
            parsed=parsed,
            matched_count=matched_count,
            unmatched_count=len(parsed) - matched_count,
        )

    @app.get("/results", response_model=List[PuzzleResultPublic])
    def get_results_for_date(
        puzzle_date: date = Query(..., description="Puzzle date (YYYY-MM-DD)"),
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> List[PuzzleResultPublic]:
        records = list_results_by_date(session, puzzle_date)
        return [PuzzleResultPublic.model_validate(record) for record in records]

    @app.get("/leaderboard", response_model=LeaderboardResponse)
    def leaderboard(
        start_date: Optional[date] = Query(None),
        end_date: Optional[date] = Query(None),
        session=Depends(get_session),
    ) -> LeaderboardResponse:
        if start_date is None and end_date is None:
            start_date, end_date = default_date_window()
        return calculate_leaderboard(session, start_date, end_date)

    @app.get("/players/{player_id}/stats", response_model=PlayerStats)
    def player_stats(player_id: int, session=Depends(get_session)) -> PlayerStats:
        stats = build_player_stats(session, player_id)
        if not stats:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")
        return stats

    @app.get("/wall-of-shame", response_model=WallOfShameResponse)
    def wall_of_shame(
        scope: str = Query("week", pattern="^(week|month)$", description="Use 'week' or 'month' defaults"),
        start_date: Optional[date] = Query(None, description="Override start date (YYYY-MM-DD)"),
        end_date: Optional[date] = Query(None, description="Override end date (YYYY-MM-DD)"),
        session=Depends(get_session),
    ) -> WallOfShameResponse:
        return find_delinquent_players(session, scope=scope, start_date=start_date, end_date=end_date)

    # Serve React frontend if the dist folder exists (production build)
    frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_spa(full_path: str) -> FileResponse:
            index = frontend_dist / "index.html"
            return FileResponse(str(index))

    return app


app = create_app()
