from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from ..auth import get_current_user
from ..database import get_session
from ..league_service import (
    LeagueError,
    create_league,
    get_league_members,
    get_membership,
    join_league,
    league_member_player_ids,
    leave_league,
    list_user_leagues,
)
from ..models import League, User
from ..schemas import (
    LeaderboardResponse,
    LeagueCreate,
    LeagueDetail,
    LeagueJoin,
    LeaguePublic,
)
from ..services import calculate_leaderboard, default_date_window

router = APIRouter(prefix="/leagues", tags=["leagues"])


def _to_public(league: League, role: Optional[str], member_count: int) -> LeaguePublic:
    return LeaguePublic(
        id=league.id,
        name=league.name,
        invite_code=league.invite_code,
        creator_id=league.creator_id,
        member_count=member_count,
        role=role,
        created_at=league.created_at,
    )


@router.post("", response_model=LeaguePublic, status_code=status.HTTP_201_CREATED)
def create_league_endpoint(
    body: LeagueCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaguePublic:
    league = create_league(session, body.name, user)
    return _to_public(league, role="admin", member_count=1)


@router.post("/join", response_model=LeaguePublic)
def join_league_endpoint(
    body: LeagueJoin,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaguePublic:
    try:
        league = join_league(session, body.invite_code, user)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    members = get_league_members(session, league.id)
    return _to_public(league, role="member", member_count=len(members))


@router.get("", response_model=List[LeaguePublic])
def list_leagues_endpoint(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> List[LeaguePublic]:
    return [
        _to_public(league, role=role, member_count=count)
        for (league, role, count) in list_user_leagues(session, user)
    ]


@router.get("/{league_id}", response_model=LeagueDetail)
def get_league_endpoint(
    league_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeagueDetail:
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found.")
    membership = get_membership(session, league_id, user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member to view this league.",
        )
    members = get_league_members(session, league_id)
    public = _to_public(league, role=membership.role, member_count=len(members))
    return LeagueDetail(**public.model_dump(), members=members)


@router.get("/{league_id}/leaderboard", response_model=LeaderboardResponse)
def league_leaderboard_endpoint(
    league_id: int,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    puzzle_type: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaderboardResponse:
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found.")
    if not get_membership(session, league_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a member to view this leaderboard.",
        )

    if start_date is None and end_date is None:
        start_date, end_date = default_date_window()

    member_ids = league_member_player_ids(session, league_id)
    return calculate_leaderboard(
        session, start_date, end_date, puzzle_type=puzzle_type, player_ids=member_ids
    )


@router.delete("/{league_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_league_endpoint(
    league_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    try:
        leave_league(session, league_id, user)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
