from __future__ import annotations

import secrets
import string
from typing import List, Optional, Tuple

from sqlmodel import Session, select

from .models import League, LeagueMembership, User
from .schemas import LeagueMemberPublic

_INVITE_ALPHABET = string.ascii_uppercase + string.digits
_INVITE_LENGTH = 8


class LeagueError(Exception):
    """Raised for expected league operation failures (mapped to 4xx)."""


def _generate_invite_code(session: Session) -> str:
    """Return a unique invite code (avoids ambiguous 0/O/1/I characters)."""
    alphabet = "".join(c for c in _INVITE_ALPHABET if c not in "O0I1")
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(_INVITE_LENGTH))
        exists = session.exec(select(League).where(League.invite_code == code)).first()
        if not exists:
            return code
    raise LeagueError("Could not generate a unique invite code; please retry.")


def get_membership(session: Session, league_id: int, user_id: int) -> Optional[LeagueMembership]:
    return session.exec(
        select(LeagueMembership).where(
            LeagueMembership.league_id == league_id,
            LeagueMembership.user_id == user_id,
        )
    ).first()


def _member_count(session: Session, league_id: int) -> int:
    return len(
        session.exec(
            select(LeagueMembership.id).where(LeagueMembership.league_id == league_id)
        ).all()
    )


def create_league(session: Session, name: str, user: User) -> League:
    league = League(
        name=name.strip(),
        invite_code=_generate_invite_code(session),
        creator_id=user.id,
    )
    session.add(league)
    session.commit()
    session.refresh(league)

    session.add(
        LeagueMembership(league_id=league.id, user_id=user.id, role="admin")
    )
    session.commit()
    return league


def join_league(session: Session, invite_code: str, user: User) -> League:
    code = invite_code.strip().upper()
    league = session.exec(select(League).where(League.invite_code == code)).first()
    if not league:
        raise LeagueError("No league found with that invite code.")

    if get_membership(session, league.id, user.id):
        raise LeagueError("You are already a member of this league.")

    session.add(LeagueMembership(league_id=league.id, user_id=user.id, role="member"))
    session.commit()
    return league


def leave_league(session: Session, league_id: int, user: User) -> None:
    membership = get_membership(session, league_id, user.id)
    if not membership:
        raise LeagueError("You are not a member of this league.")
    session.delete(membership)
    session.commit()


def list_user_leagues(session: Session, user: User) -> List[Tuple[League, str, int]]:
    """Return (league, current_user_role, member_count) for each of the user's leagues."""
    memberships = session.exec(
        select(LeagueMembership).where(LeagueMembership.user_id == user.id)
    ).all()
    out: List[Tuple[League, str, int]] = []
    for m in memberships:
        league = session.get(League, m.league_id)
        if league:
            out.append((league, m.role, _member_count(session, league.id)))
    out.sort(key=lambda t: t[0].name.lower())
    return out


def get_league_members(session: Session, league_id: int) -> List[LeagueMemberPublic]:
    memberships = session.exec(
        select(LeagueMembership).where(LeagueMembership.league_id == league_id)
    ).all()
    members: List[LeagueMemberPublic] = []
    for m in memberships:
        u = session.get(User, m.user_id)
        if not u:
            continue
        members.append(
            LeagueMemberPublic(
                user_id=u.id,
                display_name=u.display_name,
                handle=u.handle,
                player_id=u.player_id,
                role=m.role,
                joined_at=m.joined_at,
            )
        )
    members.sort(key=lambda x: (x.role != "admin", (x.handle or x.display_name).lower()))
    return members


def league_member_player_ids(session: Session, league_id: int) -> set[int]:
    """Player IDs for league members (members without a linked Player are skipped)."""
    rows = session.exec(
        select(User.player_id)
        .join(LeagueMembership, LeagueMembership.user_id == User.id)
        .where(LeagueMembership.league_id == league_id, User.player_id.is_not(None))
    ).all()
    return {pid for pid in rows if pid is not None}
