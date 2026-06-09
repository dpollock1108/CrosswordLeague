from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_admin
from ..database import get_session
from ..schemas import PlayerCreate, PlayerPublic, PlayerStats
from ..services import build_player_stats, create_player, list_players, update_player

router = APIRouter(tags=["players"])


@router.get("/players", response_model=List[PlayerPublic])
def get_players(session=Depends(get_session)) -> List[PlayerPublic]:
    return [PlayerPublic.model_validate(player) for player in list_players(session)]


@router.post("/players", response_model=PlayerPublic, status_code=status.HTTP_201_CREATED)
def post_player(
    payload: PlayerCreate,
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> PlayerPublic:
    player = create_player(session, payload)
    return PlayerPublic.model_validate(player)


@router.put("/players/{player_id}", response_model=PlayerPublic)
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


@router.get("/players/{player_id}/stats", response_model=PlayerStats)
def player_stats(player_id: int, session=Depends(get_session)) -> PlayerStats:
    stats = build_player_stats(session, player_id)
    if not stats:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")
    return stats
