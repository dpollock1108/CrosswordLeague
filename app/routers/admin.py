"""Admin-only views over the whole install.

Deliberately read-only for now. Everything that mutates already has a home in
the routers it belongs to; this is the "what is actually in the database"
window that previously required a terminal and a Cloud SQL Proxy.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from ..auth import require_admin_or_token
from ..database import get_session
from ..models import LeagueMembership, Player, PuzzleResult, User
from ..schemas import AdminUserRow

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[AdminUserRow])
def list_users(
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> List[AdminUserRow]:
    """Every registered user, newest last, with their linked Player.

    The counts are gathered as two grouped queries and joined in memory rather
    than counted per row. It's a handful of users today, but a per-row count is
    the kind of thing that quietly becomes N+1 once it isn't.
    """
    users = list(session.exec(select(User).order_by(User.created_at)).all())  # type: ignore[arg-type]

    players = {p.id: p for p in session.exec(select(Player)).all()}

    result_counts = dict(
        session.exec(
            select(PuzzleResult.player_id, func.count(PuzzleResult.id)).group_by(PuzzleResult.player_id)  # type: ignore[arg-type]
        ).all()
    )

    # Pending requests aren't memberships yet, so they shouldn't inflate a
    # user's league count.
    league_counts = dict(
        session.exec(
            select(LeagueMembership.user_id, func.count(LeagueMembership.id))
            .where(LeagueMembership.status == "active")
            .group_by(LeagueMembership.user_id)  # type: ignore[arg-type]
        ).all()
    )

    rows: List[AdminUserRow] = []
    for u in users:
        player = players.get(u.player_id) if u.player_id else None
        rows.append(
            AdminUserRow(
                id=u.id,
                email=u.email,
                display_name=u.display_name,
                handle=u.handle,
                avatar_url=u.avatar_url,
                is_admin=u.is_admin,
                created_at=u.created_at,
                last_login_at=u.last_login_at,
                player_id=u.player_id,
                player_name=player.name if player else None,
                player_handle=player.handle if player else None,
                result_count=result_counts.get(u.player_id, 0) if u.player_id else 0,
                league_count=league_counts.get(u.id, 0),
            )
        )
    return rows
