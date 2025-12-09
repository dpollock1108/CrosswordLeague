from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status

from .config import settings
from .database import get_session, init_db
from .schemas import (
    BulkPuzzleResultCreate,
    HealthResponse,
    LeaderboardResponse,
    PlayerCreate,
    PlayerPublic,
    PlayerStats,
    PuzzleResultCreate,
    PuzzleResultPublic,
)
from .services import (
    build_player_stats,
    calculate_leaderboard,
    create_player,
    default_date_window,
    list_players,
    store_results,
    upsert_puzzle_result,
)


def require_admin(x_admin_token: Optional[str] = Header(None)) -> None:
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

    @app.post("/results", response_model=List[PuzzleResultPublic])
    def post_results(
        payload: BulkPuzzleResultCreate,
        session=Depends(get_session),
        _: None = Depends(require_admin),
    ) -> List[PuzzleResultPublic]:
        results = store_results(session, payload)
        return [PuzzleResultPublic.model_validate(result) for result in results]

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

    return app


app = create_app()
