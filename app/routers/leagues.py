from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from ..auth import get_current_user
from ..database import get_session
from ..league_service import (
    LeagueError,
    approve_request,
    create_league,
    delete_league,
    deny_request,
    get_league_members,
    get_membership,
    get_pending_requests,
    get_scoring_config,
    is_active_member,
    is_admin,
    join_league,
    league_member_player_ids,
    leave_league,
    list_user_leagues,
    remove_member,
    rename_league,
    set_scoring_config,
    set_visibility,
)
from ..models import League, LeagueMembership, User
from ..schemas import (
    CategoryScoring,
    LeaderboardResponse,
    LeagueCreate,
    LeagueDetail,
    LeagueJoin,
    LeagueJoinResult,
    LeaguePublic,
    LeagueScoringConfigPublic,
    LeagueScoringConfigUpdate,
    LeagueUpdate,
    ScoringTier,
)
from ..services import calculate_leaderboard, default_date_window

router = APIRouter(prefix="/leagues", tags=["leagues"])


def _to_public(
    league: League,
    member_count: int,
    membership: Optional[LeagueMembership] = None,
) -> LeaguePublic:
    return LeaguePublic(
        id=league.id,
        name=league.name,
        invite_code=league.invite_code,
        creator_id=league.creator_id,
        visibility=league.visibility,
        member_count=member_count,
        role=membership.role if membership else None,
        membership_status=membership.status if membership else None,
        created_at=league.created_at,
    )


def _config_to_public(cfg: dict) -> LeagueScoringConfigPublic:
    def cat(c: dict) -> CategoryScoring:
        return CategoryScoring(
            tiers=[ScoringTier(max_seconds=m, points=p) for (m, p) in c["tiers"]],
            bonus=c["bonus"],
        )

    return LeagueScoringConfigPublic(mini=cat(cfg["mini"]), medium=cat(cfg["medium"]))


def _require_league(session: Session, league_id: int) -> League:
    league = session.get(League, league_id)
    if not league:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="League not found.")
    return league


def _require_admin(session: Session, league_id: int, user: User) -> None:
    if not is_admin(session, league_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a league admin can perform this action.",
        )


@router.post("", response_model=LeaguePublic, status_code=status.HTTP_201_CREATED)
def create_league_endpoint(
    body: LeagueCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaguePublic:
    league = create_league(session, body.name, user, visibility=body.visibility)
    membership = get_membership(session, league.id, user.id)
    return _to_public(league, member_count=1, membership=membership)


@router.post("/join", response_model=LeagueJoinResult)
def join_league_endpoint(
    body: LeagueJoin,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeagueJoinResult:
    try:
        league, join_status = join_league(session, body.invite_code, user)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    membership = get_membership(session, league.id, user.id)
    count = len(get_league_members(session, league.id))
    public = _to_public(league, member_count=count, membership=membership)
    return LeagueJoinResult(league=public, status=join_status)


@router.get("", response_model=List[LeaguePublic])
def list_leagues_endpoint(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> List[LeaguePublic]:
    return [
        _to_public(league, member_count=count, membership=membership)
        for (league, membership, count) in list_user_leagues(session, user)
    ]


@router.get("/{league_id}", response_model=LeagueDetail)
def get_league_endpoint(
    league_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeagueDetail:
    league = _require_league(session, league_id)
    membership = get_membership(session, league_id, user.id)
    if not membership or membership.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an active member to view this league.",
        )
    members = get_league_members(session, league_id)
    pending = get_pending_requests(session, league_id) if membership.role == "admin" else []
    public = _to_public(league, member_count=len(members), membership=membership)
    return LeagueDetail(**public.model_dump(), members=members, pending_requests=pending)


@router.patch("/{league_id}", response_model=LeaguePublic)
def update_league_endpoint(
    league_id: int,
    body: LeagueUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaguePublic:
    league = _require_league(session, league_id)
    _require_admin(session, league_id, user)
    if body.name is not None:
        league = rename_league(session, league, body.name)
    if body.visibility is not None:
        league = set_visibility(session, league, body.visibility)
    membership = get_membership(session, league_id, user.id)
    count = len(get_league_members(session, league_id))
    return _to_public(league, member_count=count, membership=membership)


@router.delete("/{league_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_league_endpoint(
    league_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    _require_league(session, league_id)
    _require_admin(session, league_id, user)
    delete_league(session, league_id)


@router.delete("/{league_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member_endpoint(
    league_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    _require_league(session, league_id)
    _require_admin(session, league_id, user)
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use 'leave league' to remove yourself.",
        )
    try:
        remove_member(session, league_id, user_id)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{league_id}/requests/{user_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve_request_endpoint(
    league_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    _require_league(session, league_id)
    _require_admin(session, league_id, user)
    try:
        approve_request(session, league_id, user_id)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{league_id}/requests/{user_id}/deny", status_code=status.HTTP_204_NO_CONTENT)
def deny_request_endpoint(
    league_id: int,
    user_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    _require_league(session, league_id)
    _require_admin(session, league_id, user)
    try:
        deny_request(session, league_id, user_id)
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{league_id}/leaderboard", response_model=LeaderboardResponse)
def league_leaderboard_endpoint(
    league_id: int,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    puzzle_type: Optional[List[str]] = Query(None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeaderboardResponse:
    _require_league(session, league_id)
    if not is_active_member(session, league_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an active member to view this leaderboard.",
        )

    if start_date is None and end_date is None:
        start_date, end_date = default_date_window()

    member_ids = league_member_player_ids(session, league_id)
    return calculate_leaderboard(
        session,
        start_date,
        end_date,
        puzzle_types=puzzle_type,
        player_ids=member_ids,
        scoring_config=get_scoring_config(session, league_id),
    )


@router.get("/{league_id}/scoring-config", response_model=LeagueScoringConfigPublic)
def get_scoring_config_endpoint(
    league_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeagueScoringConfigPublic:
    _require_league(session, league_id)
    if not is_active_member(session, league_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be an active member to view scoring.",
        )
    return _config_to_public(get_scoring_config(session, league_id))


@router.put("/{league_id}/scoring-config", response_model=LeagueScoringConfigPublic)
def update_scoring_config_endpoint(
    league_id: int,
    body: LeagueScoringConfigUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LeagueScoringConfigPublic:
    _require_league(session, league_id)
    _require_admin(session, league_id, user)
    try:
        set_scoring_config(
            session,
            league_id,
            mini_tiers=[(t.max_seconds, t.points) for t in body.mini.tiers],
            mini_bonus=body.mini.bonus,
            medium_tiers=[(t.max_seconds, t.points) for t in body.medium.tiers],
            medium_bonus=body.medium.bonus,
        )
    except LeagueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return _config_to_public(get_scoring_config(session, league_id))


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
