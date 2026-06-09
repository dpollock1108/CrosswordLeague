from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from ..database import get_session
from ..schemas import LeaderboardResponse, WallOfShameResponse
from ..services import calculate_leaderboard, default_date_window, find_delinquent_players

router = APIRouter(tags=["leaderboard"])


@router.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    puzzle_type: Optional[List[str]] = Query(
        None, description="Filter by one or more puzzle types (repeatable). Omit for all."
    ),
    session=Depends(get_session),
) -> LeaderboardResponse:
    if start_date is None and end_date is None:
        start_date, end_date = default_date_window()
    return calculate_leaderboard(session, start_date, end_date, puzzle_types=puzzle_type)


@router.get("/wall-of-shame", response_model=WallOfShameResponse)
def wall_of_shame(
    scope: str = Query("week", pattern="^(week|month)$", description="Use 'week' or 'month' defaults"),
    start_date: Optional[date] = Query(None, description="Override start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Override end date (YYYY-MM-DD)"),
    session=Depends(get_session),
) -> WallOfShameResponse:
    return find_delinquent_players(session, scope=scope, start_date=start_date, end_date=end_date)
